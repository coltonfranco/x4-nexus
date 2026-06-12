import React from "react";
import { cn } from "../lib/utils";
import { EntityIcon } from "./EntityIcon";
import { getEntityCategory, CATEGORY_COLORS } from "../lib/constants";

type ShipImageProps = {
  imageUrl?: string | null;
  iconUrl?: string | null;
  name: string;
  role?: string | null;
  classId?: string | null;
  className?: string;
  imageClassName?: string;
};

export function ShipImage({ imageUrl, iconUrl, name, role, classId, className, imageClassName }: ShipImageProps) {
  const category = getEntityCategory(role);
  const rgb = CATEGORY_COLORS[category].rgb;

  let animationClass = "animate-hover-bob-md";
  if (classId) {
    if (classId.includes("_xs") || classId.includes("_s")) animationClass = "animate-hover-bob-sm";
    else if (classId.includes("_l") || classId.includes("_xl")) animationClass = "animate-hover-bob-lg";
  }

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-background border border-border/50 rounded-xl", className)}>
      {/* Background Gradients: Static Linear + Static Base Radial */}
      <div 
        className="absolute inset-0 transition-colors duration-700 pointer-events-none" 
        style={{
          background: `
            radial-gradient(circle at center, rgba(${rgb}, 0.12) 0%, transparent 70%),
            linear-gradient(to left, rgba(${rgb}, 0.1) 0%, transparent 100%)
          `
        }} 
      />
      
      {imageUrl ? (
        <div className={cn("relative w-full h-full flex items-center justify-center pointer-events-none", animationClass)}>
          {/* Moving Radial Glow behind the ship */}
          <div 
            className="absolute -inset-10 pointer-events-none transition-colors duration-700"
            style={{
              background: `radial-gradient(ellipse at center, rgba(${rgb}, 0.18) 0%, transparent 60%)`
            }}
          />
          <img
            src={imageUrl}
            alt={name}
            className={cn(
              "relative w-full h-full object-contain drop-shadow-[0_0_12px_rgba(0,0,0,0.8)] pointer-events-auto",
              imageClassName
            )}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </div>
      ) : (
        <EntityIcon 
          src={iconUrl} 
          alt={name} 
          size={80} 
          className="relative opacity-80" 
        />
      )}
    </div>
  );
}
