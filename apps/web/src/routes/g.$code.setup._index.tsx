import { redirect } from "react-router";
import type { Route } from "./+types/g.$code.setup._index";

/** The wizard has no landing screen; it starts where the first decision is. */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
	throw redirect(`/g/${params.code.toUpperCase()}/setup/area`);
}

export default function SetupIndex() {
	return null;
}
