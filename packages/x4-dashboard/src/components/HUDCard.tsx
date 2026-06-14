import { ReactNode } from "react";
import { cn } from "../lib/utils";

type HUDCardProps = {
  children: ReactNode;
  className?: string;
  /** Pass false to hide corner accents, true by default */
  accents?: boolean;
};

export function HUDCard({ children, className, accents = true }: HUDCardProps) {
  return (
    <div 
      className={cn(
        "flex flex-col relative overflow-hidden backdrop-blur-sm",
        "border border-white/10 shadow-xl",
        className
      )} 
      style={{ 
        backgroundColor: 'rgba(12, 16, 28, 0.65)',
        backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.3) 100%)',
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.08), inset 0 0 20px rgba(0,0,0,0.5)'
      }}
    >
      {/* Subtle scanline overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(transparent_50%,rgba(0,0,0,1)_50%)] bg-[length:100%_4px] z-0" />

      {accents && (
        <>
          {/* Main Corner Brackets */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary/80 pointer-events-none z-20" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary/80 pointer-events-none z-20" />
          
          {/* Tech Notches */}
          <div className="absolute top-0 left-5 w-6 h-[2px] bg-primary/30 pointer-events-none z-20" />
          <div className="absolute bottom-0 right-5 w-6 h-[2px] bg-primary/30 pointer-events-none z-20" />
        </>
      )}
      
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
