"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

export const getSolunarTimes = action({
  args: {
    latitude: v.number(),
    longitude: v.number(),
  },
  handler: async (ctx, args) => {
    try {
      // Get current date and timezone offset
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateString = `${year}${month}${day}`;
      
      // Get timezone offset in hours (e.g., -6 for CST)
      const timezoneOffset = -Math.round(now.getTimezoneOffset() / 60);
      
      // Call Solunar API
      const url = `https://api.solunar.org/solunar/${args.latitude},${args.longitude},${dateString},${timezoneOffset}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new ConvexError({
          message: "Failed to fetch solunar data",
          code: "EXTERNAL_SERVICE_ERROR",
        });
      }
      
      const data = await response.json();
      
      return {
        sunRise: data.sunRise,
        sunSet: data.sunSet,
        moonPhase: data.moonPhase,
        moonIllumination: data.moonIllumination,
        major1Start: data.major1Start,
        major1Stop: data.major1Stop,
        major2Start: data.major2Start,
        major2Stop: data.major2Stop,
        minor1Start: data.minor1Start,
        minor1Stop: data.minor1Stop,
        minor2Start: data.minor2Start,
        minor2Stop: data.minor2Stop,
        dayRating: data.dayRating,
        hourlyRating: data.hourlyRating,
      };
    } catch (error) {
      console.error("Solunar API error:", error);
      throw new ConvexError({
        message: "Unable to fetch hunting times",
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});
