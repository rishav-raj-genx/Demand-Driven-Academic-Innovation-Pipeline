"use client";

import React, { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Tooltip,
  useMap,
} from "react-leaflet";

export interface DistrictProperties {
  id: string;
  code: string;
  name: string;
  state: string;
  centroid: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  } | null;
  challengeCount: number;
  activeProjectCount: number;
  fundedPrototypeCount: number;
  heiCount: number;
  topInstitution: string | null;
}

export interface GeoJsonDistrictFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: DistrictProperties;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  success: boolean;
  features: GeoJsonDistrictFeature[];
  metadata?: {
    totalDistricts: number;
    filters: Record<string, string | null>;
    generatedAt: string;
  };
}

export interface JharkhandMapInnerProps {
  data: GeoJsonFeatureCollection | null;
  selectedDistrict: DistrictProperties | null;
  onSelectDistrict: (district: DistrictProperties | null) => void;
  hoveredDistrict: DistrictProperties | null;
  onHoverDistrict: (district: DistrictProperties | null) => void;
  tileOffline: boolean;
  setTileOffline: (offline: boolean) => void;
}

// Center of Jharkhand [latitude, longitude]
const JHARKHAND_CENTER: [number, number] = [23.6102, 85.2799];

// Helper to determine polygon fill color based on innovation density
function getDistrictColor(count: number): string {
  if (count >= 8) return "#4338ca"; // indigo-700
  if (count >= 5) return "#2563eb"; // blue-600
  if (count >= 3) return "#0284c7"; // sky-600
  if (count >= 1) return "#0369a1"; // sky-700
  return "#1e293b"; // slate-800 (low/zero)
}

// Controller to auto-focus map when district is selected
function MapController({
  selectedDistrict,
}: {
  selectedDistrict: DistrictProperties | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (selectedDistrict?.centroid?.coordinates) {
      const [lng, lat] = selectedDistrict.centroid.coordinates;
      map.flyTo([lat, lng], 9, { duration: 1.2 });
    }
  }, [selectedDistrict, map]);

  return null;
}

export default function JharkhandMapInner({
  data,
  selectedDistrict,
  onSelectDistrict,
  hoveredDistrict,
  onHoverDistrict,
  tileOffline,
  setTileOffline,
}: JharkhandMapInnerProps) {
  // Build circular innovation density bubbles
  const densityPins = useMemo(() => {
    if (!data?.features) return [];

    return data.features
      .filter((f) => f.properties?.centroid?.coordinates)
      .map((f) => {
        const [lng, lat] = f.properties.centroid!.coordinates;
        const isSelected = selectedDistrict?.code === f.properties.code;
        const isHovered = hoveredDistrict?.code === f.properties.code;
        const count = f.properties.challengeCount;

        // Dynamic pin sizing
        const baseSize = count >= 8 ? 44 : count >= 4 ? 38 : 32;
        const size = isSelected || isHovered ? baseSize + 6 : baseSize;

        const pinIcon = L.divIcon({
          className: "custom-innovation-pin",
          html: `
            <div style="
              width: ${size}px;
              height: ${size}px;
              border-radius: 50%;
              background: ${
                isSelected
                  ? "radial-gradient(circle, #38bdf8 0%, #0284c7 100%)"
                  : count >= 5
                  ? "radial-gradient(circle, #3b82f6 0%, #1d4ed8 100%)"
                  : "radial-gradient(circle, #0284c7 0%, #0369a1 100%)"
              };
              border: ${isSelected ? "2.5px solid #ffffff" : "2px solid #93c5fd"};
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 14px rgba(0, 0, 0, 0.7), 0 0 ${isSelected ? "16px #38bdf8" : "10px rgba(59, 130, 246, 0.5)"};
              cursor: pointer;
              transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            ">
              <span style="color: #ffffff; font-weight: 800; font-size: ${size > 36 ? "13px" : "11px"}; line-height: 1;">${count}</span>
              <span style="color: #e0f2fe; font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: -0.2px; line-height: 1; margin-top: 1px;">demands</span>
            </div>
          `,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        return {
          feature: f,
          lat,
          lng,
          icon: pinIcon,
        };
      });
  }, [data, selectedDistrict, hoveredDistrict]);

  return (
    <div className="relative w-full h-[540px] rounded-2xl overflow-hidden border border-slate-800 bg-[#070d19] shadow-2xl">
      <MapContainer
        center={JHARKHAND_CENTER}
        zoom={7}
        minZoom={6}
        maxZoom={11}
        scrollWheelZoom={false}
        className="w-full h-full z-10"
        style={{ background: "#070d19" }}
      >
        <MapController selectedDistrict={selectedDistrict} />

        {/* OpenStreetMap Tile Layer with Offline Graceful Fallback */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          className={tileOffline ? "hidden" : "opacity-40 grayscale contrast-125 invert"}
          eventHandlers={{
            tileerror: () => {
              if (!tileOffline) {
                setTileOffline(true);
              }
            },
          }}
        />

        {/* PostGIS District Polygon Boundaries (Vector SVG layer works 100% offline) */}
        {data && (
          <GeoJSON
            key={JSON.stringify(data.metadata?.filters || {}) + (selectedDistrict?.code || "")}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={data as any}
            style={(feature) => {
              const props = feature?.properties as DistrictProperties | undefined;
              const count = props?.challengeCount ?? 0;
              const isSelected = selectedDistrict?.code === props?.code;
              const isHovered = hoveredDistrict?.code === props?.code;

              return {
                fillColor: getDistrictColor(count),
                fillOpacity: isSelected ? 0.8 : isHovered ? 0.7 : 0.5,
                color: isSelected ? "#38bdf8" : isHovered ? "#93c5fd" : "#475569",
                weight: isSelected ? 3 : isHovered ? 2.5 : 1.5,
                dashArray: isSelected ? "" : "2",
              };
            }}
            onEachFeature={(feature, layer) => {
              const props = feature.properties as DistrictProperties;

              layer.on({
                click: () => {
                  onSelectDistrict(
                    selectedDistrict?.code === props.code ? null : props
                  );
                },
                mouseover: () => {
                  onHoverDistrict(props);
                },
                mouseout: () => {
                  onHoverDistrict(null);
                },
              });

              layer.bindTooltip(
                `
                <div style="font-family: inherit; padding: 4px; color: #ffffff;">
                  <div style="font-weight: 700; font-size: 13px; color: #38bdf8;">${props.name} District</div>
                  <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
                    Active Civic Demands: <b style="color: #ffffff;">${props.challengeCount}</b>
                  </div>
                  <div style="font-size: 11px; color: #cbd5e1;">
                    HEIs in District: <b style="color: #ffffff;">${props.heiCount}</b>
                  </div>
                  ${
                    props.topInstitution
                      ? `<div style="font-size: 10px; color: #94a3b8; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 2px;">Top HEI: <span style="color: #818cf8;">${props.topInstitution}</span></div>`
                      : ""
                  }
                </div>
                `,
                {
                  sticky: true,
                  className: "custom-leaflet-tooltip",
                  direction: "top",
                }
              );
            }}
          />
        )}

        {/* Circular Innovation Density Markers at Centroids */}
        {densityPins.map(({ feature, lat, lng, icon }) => (
          <Marker
            key={feature.properties.code}
            position={[lat, lng]}
            icon={icon}
            eventHandlers={{
              click: () => {
                onSelectDistrict(
                  selectedDistrict?.code === feature.properties.code
                    ? null
                    : feature.properties
                );
              },
              mouseover: () => {
                onHoverDistrict(feature.properties);
              },
              mouseout: () => {
                onHoverDistrict(null);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={0.95}>
              <div className="text-center font-sans">
                <div className="font-bold text-xs text-white">
                  {feature.properties.name}
                </div>
                <div className="text-[10px] text-blue-200">
                  {feature.properties.challengeCount} active challenges
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
