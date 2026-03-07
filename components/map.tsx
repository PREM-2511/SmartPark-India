'use client'

import { useEffect, useState } from "react"
import { MapParams, MapAddressType } from "@/types"
import { buildMapInfoCardContent, buildMapInfoCardContentForDestination, destinationPin, getStreetFromAddress, parkingPin, parkingPinWithIndex } from "@/lib/utils"

// Leaflet Imports
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'

export default function Map({ mapParams }: { mapParams: string }) {
    const [isMounted, setIsMounted] = useState(false)
    const params = JSON.parse(mapParams) as MapParams[]

    // Next.js SSR fix for Leaflet
    useEffect(() => {
        setIsMounted(true)
    }, [])

    const getPinType = (loc: MapParams): string => {
        return loc.type === MapAddressType.DESTINATION ? 'parking_destination_tr' : 'parking_pin_tr'
    }

    // Helper to create Leaflet custom icons using your existing pin elements
    const createCustomIcon = (loc: MapParams, index: number) => {
        const pinType = getPinType(loc);
        let htmlElement;

        if (loc.type === MapAddressType.PARKINGLOCATION) {
            htmlElement = parkingPinWithIndex(pinType, index).element;
        } else if (loc.type === MapAddressType.ADMIN) {
            htmlElement = parkingPin(pinType).element;
        } else {
            htmlElement = destinationPin(pinType).element;
        }

        // Convert your DOM element/string into a Leaflet divIcon
        return L.divIcon({
            html: typeof htmlElement === 'string' ? htmlElement : htmlElement.outerHTML,
            className: 'custom-leaflet-icon',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        })
    }

    if (!isMounted) {
        return <p>Loading SmartPark Map...</p>
    }

    const centerPoint: [number, number] = [params[0].gpscoords.lat, params[0].gpscoords.lng]

    return (
        // 1. Added mt-4 (margin-top) to separate it from the search bar
        // 2. Added px-2 (padding-x) to indent it away from the extreme edges of the screen
        <div className="flex flex-col w-full mt-4 px-2 md:px-0">

            {/* 3. Upgraded the wrapper to look like a Shadcn UI Card with borders and shadows */}
            <div
                className="w-full rounded-xl border border-slate-200 shadow-md overflow-hidden bg-slate-50 relative"
                style={{ height: '600px', zIndex: 0 }}
            >
                <MapContainer
                    center={centerPoint}
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                >
                    {/* Free OpenStreetMap Tiles */}
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {params.map((loc, index) => {
                        const position: [number, number] = [loc.gpscoords.lat, loc.gpscoords.lng]
                        let popupContent = "";

                        if (loc.type === MapAddressType.DESTINATION) {
                            popupContent = buildMapInfoCardContentForDestination(getStreetFromAddress(loc.address), loc.address)
                        } else {
                            popupContent = buildMapInfoCardContent(
                                getStreetFromAddress(loc.address),
                                loc.address,
                                loc.numberofspots as number,
                                loc.price?.hourly as number
                            )
                        }

                        return (
                            <div key={index}>
                                {loc.type === MapAddressType.DESTINATION && (
                                    <Circle
                                        center={position}
                                        pathOptions={{ color: '#00FF00', fillColor: '#0FF000', fillOpacity: 0.35, weight: 2 }}
                                        radius={1000} // Your smaller radius!
                                    />
                                )}

                                <Marker position={position} icon={createCustomIcon(loc, index)}>
                                    <Popup>
                                        <div dangerouslySetInnerHTML={{ __html: popupContent }} />
                                    </Popup>
                                </Marker>
                            </div>
                        )
                    })}
                </MapContainer>
            </div>
        </div>
    )
}