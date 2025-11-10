
import { LatLng } from '@/types'
import React, { useEffect, useRef, useState } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { libs } from '@/lib/utils'
import { Input } from './ui/input'

type AddressAutoCompleteInputProps = {
    onAddressSelect: (address: string, gpscoords: LatLng) => void,
    selectedAddress?: string
}   

function AddressAutoCompleteInput({
    onAddressSelect, selectedAddress
} : AddressAutoCompleteInputProps) {

    const [autoComplete, setAutoComplete] = 
    useState<google.maps.places.Autocomplete | null>(null)

    const { isLoaded } = useJsApiLoader({
        nonce: "477d4456-f7b5-45e2-8945-5f17b3964752",
        googleMapsApiKey: process.env.NEXT_PUBLIC_MAPS_API_KEY!,
        libraries: libs
    })

    const placesAutoCompleteRef = useRef<HTMLInputElement>(null)

    useEffect(() => {

        if (isLoaded) {
            const miraroadBounds = new google.maps.LatLngBounds(
                new google.maps.LatLng({ lat: 19.270106241850048, lng: 72.85735328411506 }), // south west
                new google.maps.LatLng({ lat: 19.302627382146635, lng: 72.87606918009341 }) // north east
            )

            const gAutoComplete  = new google.maps.places.Autocomplete(placesAutoCompleteRef.current as HTMLInputElement, {
                bounds: miraroadBounds,
                fields: ['formatted_address', 'geometry'],
                componentRestrictions: {
                    country: ['in']
                }
            })

            gAutoComplete.addListener('place_changed', () => {
                const place = gAutoComplete.getPlace()
                const position = place.geometry?.location
                onAddressSelect(place.formatted_address!, {
                    lat: position?.lat()!,
                    lng: position?.lng()!
                })
            })
        }
    }, [isLoaded])

    useEffect(() => {
        // https://github.com/radix-ui/primitives/issues/1859
        // Disable Radix ui dialog pointer events lockout
        setTimeout(() => (document.body.style.pointerEvents = ""), 0)
    })

  return (
    <Input ref={placesAutoCompleteRef} defaultValue={selectedAddress} />
  )
}

export default AddressAutoCompleteInput