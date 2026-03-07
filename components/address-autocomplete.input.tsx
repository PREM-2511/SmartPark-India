'use client'

import { LatLng } from '@/types'
import React, { useState, useEffect, useRef } from 'react'
import { Input } from './ui/input'

type AddressAutoCompleteInputProps = {
    onAddressSelect: (address: string, gpscoords: LatLng) => void,
    selectedAddress?: string
}   

export default function AddressAutoCompleteInput({
    onAddressSelect, selectedAddress
} : AddressAutoCompleteInputProps) {
    
    const [query, setQuery] = useState(selectedAddress || "");
    const [results, setResults] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    // FIX 1: Ref to stop the useEffect from searching after a selection
    const isSelectionRef = useRef(false);
    
    // FIX 2: Ref to detect clicks outside the component
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Handle clicking outside the dropdown to close it
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        // If the query changed because we clicked an item, stop the search and reset the flag
        if (isSelectionRef.current) {
            isSelectionRef.current = false;
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            if (query.length > 2) {
                const apiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY;
                
                const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${apiKey}&country=in`;

                try {
                    const res = await fetch(url);
                    const data = await res.json();
                    setResults(data.features || []);
                    setIsOpen(true);
                } catch (error) {
                    console.error("Geocoding error:", error);
                }
            } else {
                setResults([]);
                setIsOpen(false);
            }
        }, 400);

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    const handleSelect = (feature: any) => {
        const address = feature.place_name;
        const lng = feature.geometry.coordinates[0];
        const lat = feature.geometry.coordinates[1];

        // Tell the useEffect that this query change is from a click!
        isSelectionRef.current = true; 
        
        setQuery(address);
        setIsOpen(false);
        onAddressSelect(address, { lat, lng });
    };

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <Input 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for parking..."
                autoComplete="off"
                onFocus={() => { if (results.length > 0) setIsOpen(true) }} // Re-open if clicking back into input
            />
            
            {isOpen && results.length > 0 && (
                <ul className="absolute z-50 w-full bg-background border border-border rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {results.map((feature) => (
                        <li 
                            key={feature.id} 
                            className="px-4 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm"
                            onClick={() => handleSelect(feature)}
                        >
                            {feature.place_name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}