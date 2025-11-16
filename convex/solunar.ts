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
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const dateString = `${year}${month}${day}`;

      // Get timezone offset in hours (e.g., -6 for CST)
      const timezoneOffset = -Math.round(now.getTimezoneOffset() / 60);

      // Call Solunar API
      const url = `https://api.solunar.org/solunar/${args.latitude},${args.longitude},${dateString},${timezoneOffset}`;

      // Add timeout to fetch request (30 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);

        // Handle timeout errors
        if (
          fetchError.name === "AbortError" ||
          fetchError.code === "UND_ERR_CONNECT_TIMEOUT"
        ) {
          throw new ConvexError({
            message:
              "Connection timeout while fetching solunar data. The Solunar API may be temporarily unavailable. Please try again later.",
            code: "EXTERNAL_SERVICE_ERROR",
          });
        }

        // Handle connection errors
        if (
          fetchError.code === "UND_ERR_CONNECT_TIMEOUT" ||
          fetchError.message?.includes("timeout")
        ) {
          throw new ConvexError({
            message:
              "Unable to connect to Solunar API. The service may be temporarily unavailable. Please try again later.",
            code: "EXTERNAL_SERVICE_ERROR",
          });
        }

        // Re-throw other fetch errors
        throw fetchError;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new ConvexError({
          message: `Failed to fetch solunar data: ${response.status} ${response.statusText}. ${errorText}`,
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
      // If it's already a ConvexError, re-throw it
      if (error instanceof ConvexError) {
        throw error;
      }

      console.error("Solunar API error:", error);

      // Provide more specific error messages based on error type
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("Timeout")
      ) {
        throw new ConvexError({
          message:
            "Connection timeout while fetching solunar data. The Solunar API may be temporarily unavailable. Please try again later.",
          code: "EXTERNAL_SERVICE_ERROR",
        });
      }

      if (
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("ECONNREFUSED")
      ) {
        throw new ConvexError({
          message:
            "Unable to connect to Solunar API. The service may be temporarily unavailable. Please try again later.",
          code: "EXTERNAL_SERVICE_ERROR",
        });
      }

      // Generic error fallback
      throw new ConvexError({
        message: `Unable to fetch hunting times: ${errorMessage}`,
        code: "EXTERNAL_SERVICE_ERROR",
      });
    }
  },
});
