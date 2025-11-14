import { httpRouter } from "convex/server";
import { auth } from "./authent";

const http = httpRouter();

auth.addHttpRoutes(http);

export default http;
