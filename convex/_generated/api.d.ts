/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _helpers from "../_helpers.js";
import type * as activeViewers from "../activeViewers.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as deerRecovery from "../deerRecovery.js";
import type * as errors from "../errors.js";
import type * as forums from "../forums.js";
import type * as friends from "../friends.js";
import type * as http from "../http.js";
import type * as huntingUnits from "../huntingUnits.js";
import type * as hunts from "../hunts.js";
import type * as landLeases from "../landLeases.js";
import type * as locationSharing from "../locationSharing.js";
import type * as otp_ResendOTP from "../otp/ResendOTP.js";
import type * as otp_VerificationCodeEmail from "../otp/VerificationCodeEmail.js";
import type * as passwordReset_PasswordResetEmail from "../passwordReset/PasswordResetEmail.js";
import type * as passwordReset_ResendOTPPasswordReset from "../passwordReset/ResendOTPPasswordReset.js";
import type * as profile from "../profile.js";
import type * as properties from "../properties.js";
import type * as roles from "../roles.js";
import type * as scoutingTrips from "../scoutingTrips.js";
import type * as solunar from "../solunar.js";
import type * as support from "../support.js";
import type * as tracks from "../tracks.js";
import type * as users from "../users.js";
import type * as vehicleRecovery from "../vehicleRecovery.js";
import type * as waypoints from "../waypoints.js";
import type * as weather from "../weather.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _helpers: typeof _helpers;
  activeViewers: typeof activeViewers;
  audit: typeof audit;
  auth: typeof auth;
  deerRecovery: typeof deerRecovery;
  errors: typeof errors;
  forums: typeof forums;
  friends: typeof friends;
  http: typeof http;
  huntingUnits: typeof huntingUnits;
  hunts: typeof hunts;
  landLeases: typeof landLeases;
  locationSharing: typeof locationSharing;
  "otp/ResendOTP": typeof otp_ResendOTP;
  "otp/VerificationCodeEmail": typeof otp_VerificationCodeEmail;
  "passwordReset/PasswordResetEmail": typeof passwordReset_PasswordResetEmail;
  "passwordReset/ResendOTPPasswordReset": typeof passwordReset_ResendOTPPasswordReset;
  profile: typeof profile;
  properties: typeof properties;
  roles: typeof roles;
  scoutingTrips: typeof scoutingTrips;
  solunar: typeof solunar;
  support: typeof support;
  tracks: typeof tracks;
  users: typeof users;
  vehicleRecovery: typeof vehicleRecovery;
  waypoints: typeof waypoints;
  weather: typeof weather;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
