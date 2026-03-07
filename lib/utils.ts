import { Booking } from "@/schemas/booking"
import { type ClassValue, clsx } from "clsx"
import { compareAsc, differenceInMinutes, getHours, getMinutes } from "date-fns"
import { twMerge } from "tailwind-merge"

// Removed Google Maps Library import since we don't need it anymore!
export const libs: string[] = ['core', 'maps', 'places', 'marker']

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAmountForDisplay(
  amount: number, currency: string
): string {

  let numberFormat = new Intl.NumberFormat(['en-IN'], {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'symbol'
  })

  const formatedAmount = numberFormat.format(amount)
  return formatedAmount === 'NaN' ? '' : formatedAmount
}

export function formatAmountForStripe(
  amount: number,
  currency: string
): number {

  let numberFormat = new Intl.NumberFormat(['en-IN'], {
    style: 'currency',
    currency: currency,
    currencyDisplay: 'symbol'
  })

  const parts = numberFormat.formatToParts(amount)
  let zeroDecimalCurrency: boolean = true

  for (let part of parts) {
    if (part.type === 'decimal') {
      zeroDecimalCurrency = false
    }
  }

  return zeroDecimalCurrency ? amount : Math.round(amount * 100)
}

export function getStreetFromAddress(address: string) {
  return address.split(',')[0]
}

/// Leaflet Map Info Card Builders (These use standard HTML, so they work perfectly)
export const buildMapInfoCardContent = (title: string, address: string, totalSpots: number, price: number): string => {
  return `
    <div class="map_infocard_content">
      <div class="map_infocard_title">${title}</div>
      <div class="map_infocard_body">
      <div>${address}</div>
      <hr />
      <div>Total spots: ${totalSpots}</div>
      <div>Hourly price: ${formatAmountForDisplay(price, 'INR')}</div>
      </div>
      
  </div>
  `
}

export const buildMapInfoCardContentForDestination = (title: string, address: string): string => {
  return `
  <div class="map_infocard_content">
      <div class="map_infocard_title">${title}</div>
      <div class="map_infocard_body">
      <div>${address}</div>
      </div>
      
  </div>`;
}

/// Leaflet Pin Builders (Replaced google.maps.marker.PinElement with standard DOM elements)
export const parkingPin = (type: string) => {
  const container = document.createElement('div')
  container.innerHTML = `
    <div class="map_pin_container">
      <img src='/${type}.png' style="width: 35px; height: auto;" />
    </div>
  `
  // Return an object with 'element' to match your map.tsx logic
  return { element: container }
}

export const parkingPinWithIndex = (type: string, index: number) => {
  const container = document.createElement('div');

  // We use inline CSS here to force perfect alignment of the black circle over the pin
  container.innerHTML = `
    <div style="position: relative; width: 35px; height: 45px; display: flex; flex-direction: column; align-items: center;">
      <div style="position: absolute; top: 4px; left: 50%; transform: translateX(-50%); background-color: black; color: white; border-radius: 50%; width: 22px; height: 22px; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 13px; z-index: 10;">
        ${index + 1}
      </div>
      <img src='/${type}.png' style="width: 35px; height: auto;" />
    </div>
  `;
  return { element: container };
}

export const destinationPin = (type: string) => {
  const img = document.createElement('img');
  img.src = `/${type}.png`;
  img.style.width = '40px';
  img.style.height = 'auto';

  return { element: img }
}

export type ReturnType = {
  time: string,
  display: string
}

export function getTimeSlots(startTime = "00:00", endTime = "23:45"): ReturnType[] {
  const timeArray: ReturnType[] = []
  const parsedStartTime: Date = new Date(`2000-01-01T${startTime}:00`)
  const parsedEndTime: Date = new Date(`2000-01-01T${endTime}:00`)

  let currentTime: Date = parsedStartTime
  while (currentTime <= parsedEndTime) {
    const hours = currentTime.getHours().toString().padStart(2, "0")
    const minutes = currentTime.getMinutes().toString().padStart(2, "0")
    const ampm = currentTime.getHours() < 12 ? "AM" : "PM"
    const timeString = `${hours}:${minutes} ${ampm}`
    timeArray.push({
      time: `${hours}:${minutes}`,
      display: timeString
    })

    currentTime.setMinutes(currentTime.getMinutes() + 30)
  }

  return timeArray
}

export function sortcomparer(b1: Booking, b2: Booking) {
  return compareAsc(b1.starttime, b2.starttime)
}

export function blockLength(starttime: Date, endtime: Date) {
  return differenceInMinutes(endtime, starttime)
}

export function blockPostion(starttime: Date) {
  const h = getHours(starttime)
  const m = getMinutes(starttime)
  return (h * 60) + m
}