'use server'

import { stripe } from "@/lib/stripe"
import EmailTemplate from "@/components/email-template"
import { SearchParams } from "@/components/search-component"
import ViolationEmailTemplate from "@/components/violation-email-template"
import { connectToDB } from "@/lib/db"
import { Booking, BookingModel } from "@/schemas/booking"
import { ParkingLocation, ParkingLocationModel } from "@/schemas/parking-locations"
import { ActionResponse, BookingStatus, ParkingLocationStatus, UpdateLocationParams } from "@/types"
import { currentUser } from "@clerk/nextjs/server"
import { compareAsc, format, formatDate } from "date-fns"
import { revalidatePath } from "next/cache"
import { Resend } from 'resend'
import { redirect } from "next/navigation"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function toggleLocation({ id, path }: {
    id: string, path: string
}) {

    await connectToDB()

    const location = await ParkingLocationModel.findById<ParkingLocation>(id)

    if (location) {
        location.status = location.status === ParkingLocationStatus.AVAILABLE
            ? ParkingLocationStatus.NOTAVAILABLE : ParkingLocationStatus.AVAILABLE

        const result = await location.save()

        if (result) {
            revalidatePath(path)
        }
    }
}

export async function deleteLocation({ id, path }: {
    id: string, path: string
}) {

    await connectToDB()

    const deleteResult = await ParkingLocationModel.findByIdAndDelete(id)

    if (deleteResult) {
        revalidatePath(path)
    }
}

export async function updateLocation({ id, path, location }: {
    id: string,
    path: string,
    location: UpdateLocationParams
}) {

    try {
        await connectToDB()

        const result = await ParkingLocationModel.updateOne({
            _id: id
        }, {
            $set: location
        })

        revalidatePath(path)
        revalidatePath('/dashboard/locations')

    } catch (error) {
        console.log(error)
        throw error
    }
    redirect('/dashboard/locations/tileview')
}

export async function findNearbyLocations(maxDistance: number, searchParams: SearchParams) {

    try {

        await connectToDB()

        const st = new Date(`${searchParams.arrivingon}T${searchParams.arrivingtime}`)
        const et = new Date(`${searchParams.arrivingon}T${searchParams.leavingtime}`)

        const parkingLocations: ParkingLocation[] = await ParkingLocationModel.find({
            location: {
                $nearSphere: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [searchParams.gpscoords.lng, searchParams.gpscoords.lat]
                    },
                    $maxDistance: maxDistance // meters
                }
            }
        }).lean()

        // go through all locations and find the bookings for it
        const availableLocations =
            await Promise.all(parkingLocations.map(async (location: ParkingLocation) => {

                const bookings = await BookingModel.find({
                    locationid: location._id,
                    status: BookingStatus.BOOKED,
                    starttime: {
                        $lt: et
                    },
                    endtime: {
                        $gt: st
                    }
                }).lean()

                if (bookings.length < location.numberofspots) {
                    return { ...location, ...{ bookedspots: bookings.length } }
                } else
                    return { ...location, ...{ bookedspots: bookings.length, status: ParkingLocationStatus.FULL } }
            }))

        return JSON.parse(JSON.stringify(availableLocations))

    } catch (error) {
        console.log(error)
        throw error
    }
}

export async function getParkingLocation(
    id: string
) {
    try {

        connectToDB()

        const location = await ParkingLocationModel.findById<ParkingLocation>(id)

        return JSON.parse(JSON.stringify(location))

    } catch (error) {
        console.log(error)
        throw error
    }
}

export async function getParkingLocations() {
    try {

        connectToDB()

        const location = await ParkingLocationModel.find<ParkingLocation>({})

        return JSON.parse(JSON.stringify(location))

    } catch (error) {
        console.log(error)
        throw error
    }
}

export async function sendConfirmationEmail(bookingid: string): Promise<ActionResponse> {

    try {
        // get the user
        const user = await currentUser()

        if (!user) {
            throw new Error('You must be logged in')
        }

        await connectToDB()

        const booking = await BookingModel.findById<Booking>(bookingid).populate({
            path: 'locationid', model: ParkingLocationModel
        }).lean()

        if (booking) {
            const { data, error } = await resend.emails.send({
                from: "SmartPark India <onboarding@resend.dev>",
                to: user.primaryEmailAddress?.emailAddress!,
                subject: "Your booking has been confirmed",
                react: EmailTemplate({
                    firstName: user?.firstName!,
                    bookingDate: formatDate(booking.bookingdate, 'MMM dd, yyyy'),
                    arrivingOn: formatDate(booking.starttime, 'hh:mm a'),
                    leavingOn: formatDate(booking.endtime, 'hh:mm a'),
                    plateNo: booking.plate,
                    address: ((booking?.locationid as any) as ParkingLocation).address
                })
            })

            if (error) {
                console.log(error)
                return {
                    code: 1,
                    message: 'Failed to send email',
                    error: error
                }
            }

            return {
                code: 0,
                message: 'Email sent',
                error: error
            }
        }

        return {
            code: 1,
            message: 'Something went wrong',
        }

    } catch (error) {
        console.log(error)
        throw error
    }
}

export async function sendViolationEmail(plate: string, address: string, timestamp: string): Promise<ActionResponse> {

    try {

        const { data, error } = await resend.emails.send({
            from: "SmartPark India <onboarding@resend.dev>",
            to: process.env.VIOLATION_EMAIL!,
            subject: "Violation reported",
            react: ViolationEmailTemplate({
                plate: plate,
                address: address,
                timestamp: timestamp
            })
        })

        if (error) {
            console.log(error)
            return {
                code: 1,
                message: 'Failed to send email',
                error: error
            }
        }

        return {
            code: 0,
            message: 'Email sent',
            error: error
        }

    } catch (error) {
        console.log(error)
        throw error
    }
}

export async function cancelBooking({ bookingid, path }: {
    bookingid: string, path: string
}) {

    try {
        await connectToDB()

        // 3. Find the booking first, don't update it yet
        const booking = await BookingModel.findById(bookingid)

        if (!booking) {
            return {
                code: 1,
                message: 'Booking not found'
            }
        }
        
        // 4. If it's already cancelled, just return success
        if (booking.status === BookingStatus.CANCELLED) {
             return {
                code: 0,
                message: 'Booking already cancelled'
            }
        }

        // 5. Update the booking status and save
        booking.status = BookingStatus.CANCELLED
        booking.amount = 0 // Your logic
        await booking.save()

        // --- THIS IS THE FIX ---
        // 6. Decrement the 'bookedspots' count on the location
        await ParkingLocationModel.updateOne(
            { _id: booking.locationid },
            { $inc: { bookedspots: -1 } } 
        )
        // -----------------------

        // 7. Revalidate both pages
        revalidatePath(path) // This revalidates '/mybookings'
        revalidatePath('/dashboard/locations/tileview') // This revalidates the admin page

        return {
            code: 0,
            message: 'Booking cancelled'
        }
    } catch (error) {
        console.log(error)
        // 8. Return an error object instead of throwing
        return {
            code: 1,
            message: 'An error occurred while cancelling.'
        }
    }
}

export async function updateBooking(selfid: string, date: Date, starttime: string, endtime: string, path: string) {

    try {
        await connectToDB()

        const dt = format(date, 'yyyy-MM-dd')
        const st = new Date(`${dt}T${starttime}`)
        const et = new Date(`${dt}T${endtime}`)

        if (compareAsc(st, et) !== -1) {
            return { code: 1, message: 'Start time must be before end time' }
        }

        const originalBooking = await BookingModel.findById<Booking>(selfid)

        if (!originalBooking) {
            throw new Error('Booking not found')
        }

        const parkingLocation = await ParkingLocationModel.findById<ParkingLocation>(originalBooking.locationid).lean()

        if (!parkingLocation) {
            throw new Error('Parking location not found')
        }

        // --- Collision Check (Your existing logic is good) ---
        let condition: any = {}
        const originalStarttime = originalBooking.starttime
        const originalEndtime = originalBooking.endtime

        if (compareAsc(st, originalStarttime) !== 0 && compareAsc(et, originalEndtime) !== 0) {
            condition['starttime'] = { $lt: et }
            condition['endtime'] = { $gt: st }
        } else if (compareAsc(st, originalStarttime) !== 0) {
            condition['starttime'] = { $lte: st }
            condition['endtime'] = { $gt: st }
        } else if (compareAsc(et, originalEndtime) !== 0) {
            condition['starttime'] = { $lt: et }
            condition['endtime'] = { $gte: et }
        }

        const bookings = await BookingModel.find({
            _id: { $ne: selfid },
            locationid: originalBooking.locationid,
            status: BookingStatus.BOOKED,
            ...condition
        })
        // --- End of Collision Check ---

        if (bookings.length < parkingLocation.numberofspots) {
            // --- This is the new price calculation logic ---

            // 1. Calculate new price
            const newTotalPriceInPaise = calculatePriceInPaise(st, et, parkingLocation.price.hourly);

            // 2. Get old price (Assuming you store this on the booking)
            const oldAmountPaidInPaise = originalBooking.totalamount;

            // 3. Calculate the difference
            const differenceInPaise = newTotalPriceInPaise - oldAmountPaidInPaise;

            if (differenceInPaise <= 0) {
                // --- FREE EDIT (Time reduced or same) ---
                originalBooking.bookingdate = date
                originalBooking.starttime = st
                originalBooking.endtime = et
                originalBooking.totalamount = newTotalPriceInPaise // Update to new, lower amount

                await originalBooking.save()
                revalidatePath(path)

                return {
                    code: 0,
                    message: 'Booking updated'
                }

            } else {
                // --- PAID EDIT (User owes more money) ---
                // Create a Stripe session for the difference

                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    line_items: [{
                        price_data: {
                            currency: 'inr',
                            product_data: {
                                name: `Booking Update: ${parkingLocation.address}`,
                                description: 'Additional charge for time extension'
                            },
                            unit_amount: differenceInPaise, // Charge ONLY the difference
                        },
                        quantity: 1,
                    }],
                    mode: 'payment',
                    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/book/checkout/result?session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}${path}`, // Send back to 'My Bookings'

                    // CRITICAL: Pass new booking data to the success page
                    metadata: {
                        isEdit: 'true',
                        bookingId: selfid,
                        newDateISO: date.toISOString(),
                        newStartTimeISO: st.toISOString(),
                        newEndTimeISO: et.toISOString(),
                        newTotalAmount: newTotalPriceInPaise // The *new total*
                    }
                });

                // Return a special code and the URL
                return {
                    code: 100, // 100 = Payment redirect
                    url: session.url
                }
            }
        }

        // This runs if the collision check failed
        return {
            code: 1,
            message: 'These time slots are no longer available. Please try different times.'
        }
    } catch (error) {
        console.log(error)
        return { code: 1, message: 'An unexpected error occurred.' }
    }
}

// Add this helper function in your actions file or a utils file

/**
 * Calculates the total price in paise (smallest currency unit).
 * @param startTime The start date/time
 * @param endTime The end date/time
 * @param hourlyRate The hourly rate (e.g., 25 for ₹25)
 * @returns The total price in paise (e.g., 5000 for ₹50.00)
 */
function calculatePriceInPaise(startTime: Date, endTime: Date, hourlyRate: number): number {
    // Calculate duration in minutes
    const durationInMinutes = (endTime.getTime() - startTime.getTime()) / 60000;

    if (durationInMinutes <= 0) {
        // Return 0 or throw an error if the time is invalid
        return 0;
    }

    // Calculate price per minute
    const pricePerMinute = hourlyRate / 60;

    // Calculate total price in rupees
    const totalPriceInRupees = pricePerMinute * durationInMinutes;

    // Convert to paise and use Math.ceil to always round up
    // This ensures you charge for partial hours (e.g., 1.5 hours)
    return Math.ceil(totalPriceInRupees * 100);
}

export async function getBookings(date: Date,
    locationid: string, status: BookingStatus) {

    try {

        const bookings = await BookingModel.find({
            status: status || BookingStatus.BOOKED,
            locationid: locationid,
            $expr: {
                $eq: [{
                    $dateToString: {
                        format: '%Y-%m-%d', date: '$bookingdate'
                    }
                }, format(date, 'yyyy-MM-dd')]
            }
        }).populate({
            path: 'locationid', model: ParkingLocationModel
        }).lean()

        return {
            code: 0,
            message: '',
            data: JSON.parse(JSON.stringify(bookings))
        }
    } catch (error) {
        throw error
    }

}

export async function deleteBooking(bookingid: string) {

    try {
        connectToDB()

        const booking = await BookingModel.findByIdAndDelete(bookingid)
        const deletedBooking = await BookingModel.findByIdAndDelete(bookingid);

        if (deletedBooking) {
            await ParkingLocationModel.updateOne(
                { _id: deletedBooking.locationid },
                { $inc: { bookedspots: -1 } } // Decrement the count by 1
            );
        }

        // 3. Revalidate the paths so the admin card updates
        revalidatePath('/dashboard/locations/tileview');

    } catch (error) {
        console.error("Failed to delete booking:", error)
        throw error
    }
}