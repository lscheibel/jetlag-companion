import { useEffect, useState } from "react";
import { fetchPhoto } from "../api";

interface PhotoImageProps {
	photoId: string;
	token: string;
	alt: string;
	className?: string;
}

export function PhotoImage({
	photoId,
	token,
	alt,
	className,
}: PhotoImageProps) {
	const [source, setSource] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		let objectUrl: string | null = null;
		void fetchPhoto(photoId, token)
			.then((blob) => {
				if (!active) return;
				objectUrl = URL.createObjectURL(blob);
				setSource(objectUrl);
			})
			.catch(() => {
				if (active) setSource(null);
			});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [photoId, token]);

	if (!source) {
		return (
			<div
				className={className}
				data-testid={`photo-${photoId}-loading`}
				role="img"
				aria-label={`${alt} loading`}
			/>
		);
	}
	return (
		<img
			alt={alt}
			className={className}
			data-testid={`photo-${photoId}`}
			src={source}
		/>
	);
}
