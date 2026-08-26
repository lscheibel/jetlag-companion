/**
 * The game-area casing, in yellow and black: a light case against the dim,
 * a dark core against the map.
 */
export function yellowBlackLine(id: string, dashed = false) {
	const dash = dashed ? { "line-dasharray": [2, 1.5] } : {};
	return [
		{
			id: `${id}-case`,
			type: "line" as const,
			layout: {
				"line-join": "round" as const,
				"line-cap": "round" as const,
			},
			paint: {
				"line-color": "#ffe01f",
				"line-width": 7,
				...dash,
			},
		},
		{
			id,
			type: "line" as const,
			layout: {
				"line-join": "round" as const,
				"line-cap": "round" as const,
			},
			paint: {
				"line-color": "#08111c",
				"line-width": 3,
				...dash,
			},
		},
	];
}
