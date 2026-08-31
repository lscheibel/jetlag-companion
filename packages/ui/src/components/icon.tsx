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
	CopyIcon,
	CornersOutIcon,
	CrosshairIcon,
	DotsThreeIcon,
	DotsThreeOutlineIcon,
	EyeIcon,
	EyeSlashIcon,
	FlagBannerIcon,
	GearSixIcon,
	GithubLogoIcon,
	HourglassMediumIcon,
	InfoIcon,
	LineSegmentIcon,
	ListBulletsIcon,
	MagnifyingGlassIcon,
	MapPinIcon,
	MapPinSimpleAreaIcon,
	MapTrifoldIcon,
	MinusIcon,
	MoonIcon,
	NoteBlankIcon,
	PauseIcon,
	PencilLineIcon,
	PlusIcon,
	PolygonIcon,
	ProhibitIcon,
	QrCodeIcon,
	QuestionIcon,
	RulerIcon,
	ScissorsIcon,
	SealQuestionIcon,
	ShareFatIcon,
	SignOutIcon,
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
 * Fill, because a glyph in this app is read at 17px on a phone held at arm's
 * length in daylight, and because a filled shape holds its own beside Bricolage
 * at 800. The alternative it replaces was literal characters typed into JSX —
 * ▦ ✎ ◎ ⇪ ━ ◉ ☰ ⋯ — which render differently on every phone and cannot take a
 * weight at all.
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
	copy: CopyIcon,
	"corners-out": CornersOutIcon,
	crosshair: CrosshairIcon,
	"dots-three": DotsThreeIcon,
	"dots-three-outline": DotsThreeOutlineIcon,
	eye: EyeIcon,
	"eye-slash": EyeSlashIcon,
	"flag-banner": FlagBannerIcon,
	"gear-six": GearSixIcon,
	github: GithubLogoIcon,
	"hourglass-medium": HourglassMediumIcon,
	info: InfoIcon,
	"line-segment": LineSegmentIcon,
	"list-bullets": ListBulletsIcon,
	"magnifying-glass": MagnifyingGlassIcon,
	"map-pin": MapPinIcon,
	"map-pin-simple-area": MapPinSimpleAreaIcon,
	"map-trifold": MapTrifoldIcon,
	minus: MinusIcon,
	moon: MoonIcon,
	"note-blank": NoteBlankIcon,
	pause: PauseIcon,
	"pencil-line": PencilLineIcon,
	plus: PlusIcon,
	polygon: PolygonIcon,
	prohibit: ProhibitIcon,
	"qr-code": QrCodeIcon,
	question: QuestionIcon,
	ruler: RulerIcon,
	scissors: ScissorsIcon,
	"seal-question": SealQuestionIcon,
	"share-fat": ShareFatIcon,
	"sign-out": SignOutIcon,
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
	/** Fill everywhere. Overridden only where a stroke is the meaning. */
	weight?: IconWeight;
	className?: string;
}

export function Icon({
	name,
	size = "sm",
	weight = "fill",
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
