import type { IconWeight, Icon as PhosphorIcon } from "@phosphor-icons/react";
import {
	BusIcon,
	CaretDownIcon,
	CaretLeftIcon,
	CaretRightIcon,
	CaretUpIcon,
	CheckIcon,
	CircleDashedIcon,
	CircleHalfIcon,
	ClipboardTextIcon,
	ClockIcon,
	CornersOutIcon,
	CrosshairIcon,
	DotsThreeIcon,
	DotsThreeOutlineIcon,
	EyeIcon,
	EyeSlashIcon,
	FlagBannerIcon,
	GearSixIcon,
	HourglassMediumIcon,
	InfoIcon,
	ListBulletsIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	MapTrifoldIcon,
	MinusIcon,
	MoonIcon,
	NoteBlankIcon,
	PencilSimpleIcon,
	PlusIcon,
	PolygonIcon,
	ProhibitIcon,
	QrCodeIcon,
	QuestionIcon,
	RulerIcon,
	ScissorsIcon,
	SealQuestionIcon,
	ShareNetworkIcon,
	SignOutIcon,
	SquaresFourIcon,
	SunIcon,
	TimerIcon,
	TrainSimpleIcon,
	TramIcon,
	UploadSimpleIcon,
	UserPlusIcon,
	UsersThreeIcon,
	WarningIcon,
	XIcon,
} from "@phosphor-icons/react";
import { cn } from "../lib/utils";

/**
 * One set, one weight.
 *
 * Bold, because a glyph in this app is read at 17px on a phone held at arm's
 * length in daylight, and because it is the only weight that keeps its shape
 * beside Bricolage at 800. The alternative it replaces was literal characters
 * typed into JSX — ▦ ✎ ◎ ⇪ ━ ◉ ☰ ⋯ — which render differently on every phone
 * and cannot take a weight at all.
 *
 * The registry is closed on purpose. A screen that needs a glyph the app has
 * no name for is a screen proposing a new piece of vocabulary, and that is
 * worth one line in this file rather than a free import.
 *
 * No icon travels alone: every one of these appears beside its label, except
 * inside a 44px map control, where the label lives in `aria-label` and the
 * control is one of five a player learns once.
 */

const ICONS = {
	bus: BusIcon,
	"caret-down": CaretDownIcon,
	"caret-left": CaretLeftIcon,
	"caret-right": CaretRightIcon,
	"caret-up": CaretUpIcon,
	check: CheckIcon,
	clipboard: ClipboardTextIcon,
	"circle-dashed": CircleDashedIcon,
	"circle-half": CircleHalfIcon,
	clock: ClockIcon,
	"corners-out": CornersOutIcon,
	crosshair: CrosshairIcon,
	"dots-three": DotsThreeIcon,
	"dots-three-outline": DotsThreeOutlineIcon,
	eye: EyeIcon,
	"eye-slash": EyeSlashIcon,
	"flag-banner": FlagBannerIcon,
	"gear-six": GearSixIcon,
	"hourglass-medium": HourglassMediumIcon,
	info: InfoIcon,
	"list-bullets": ListBulletsIcon,
	"magnifying-glass": MagnifyingGlassIcon,
	"map-pin": MapPinIcon,
	"map-trifold": MapTrifoldIcon,
	minus: MinusIcon,
	moon: MoonIcon,
	"note-blank": NoteBlankIcon,
	"pencil-simple": PencilSimpleIcon,
	plus: PlusIcon,
	polygon: PolygonIcon,
	prohibit: ProhibitIcon,
	"qr-code": QrCodeIcon,
	question: QuestionIcon,
	ruler: RulerIcon,
	scissors: ScissorsIcon,
	"seal-question": SealQuestionIcon,
	"share-network": ShareNetworkIcon,
	"sign-out": SignOutIcon,
	"squares-four": SquaresFourIcon,
	sun: SunIcon,
	timer: TimerIcon,
	"train-simple": TrainSimpleIcon,
	tram: TramIcon,
	"upload-simple": UploadSimpleIcon,
	"user-plus": UserPlusIcon,
	"users-three": UsersThreeIcon,
	warning: WarningIcon,
	x: XIcon,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

/**
 * Four sizes, never scaled between them: 17px inside rows, chips and the tool
 * strip, 20px on step buttons, 24px in a door's glyph tile, 14px in a chip.
 */
export type IconSize = "xs" | "sm" | "md" | "lg";

const PX: Record<IconSize, number> = { xs: 14, sm: 17, md: 20, lg: 24 };

interface IconProps {
	name: IconName;
	size?: IconSize;
	/** Bold everywhere. Overridden only where a filled shape is the meaning. */
	weight?: IconWeight;
	className?: string;
}

export function Icon({
	name,
	size = "sm",
	weight = "bold",
	className,
}: IconProps) {
	const Glyph = ICONS[name];
	return (
		<Glyph
			aria-hidden
			className={cn("shrink-0", className)}
			// currentColor always: an icon takes the colour of the control it sits
			// in, which is what lets one glyph work on the action yellow and on a
			// dark surface.
			color="currentColor"
			size={PX[size]}
			weight={weight}
		/>
	);
}
