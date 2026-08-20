import { useEffect, useState } from "react";
import { useMapInstance } from "./map-canvas";

export interface MapCameraState {
	readonly bearing: number;
	readonly pitch: number;
	readonly zoom: number;
}

const DEFAULT_CAMERA: MapCameraState = { bearing: 0, pitch: 0, zoom: 0 };

export function useMapCamera(): MapCameraState {
	const map = useMapInstance();
	const [camera, setCamera] = useState(DEFAULT_CAMERA);

	useEffect(() => {
		if (!map) return;
		const update = () =>
			setCamera({
				bearing: map.getBearing(),
				pitch: map.getPitch(),
				zoom: map.getZoom(),
			});
		update();
		map.on("rotate", update);
		map.on("pitch", update);
		map.on("zoom", update);
		return () => {
			map.off("rotate", update);
			map.off("pitch", update);
			map.off("zoom", update);
		};
	}, [map]);

	return camera;
}
