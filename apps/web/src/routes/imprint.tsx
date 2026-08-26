import {
	Screen,
	ScreenBody,
	ScreenHeader,
} from "@zero-lag/ui/components/screen";
import { useNavigate } from "react-router";

/**
 * The legal notice the start screen points at. German, because that is the
 * language the TMG writes in and the language a German host is owed.
 */
export default function Imprint() {
	const navigate = useNavigate();

	return (
		<Screen>
			<ScreenHeader onBack={() => void navigate("/")} title="Impressum" />
			<ScreenBody className="gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm leading-snug">
				<section className="flex flex-col gap-1.5" lang="de">
					<h2 className="text-base">Angaben gemäß § 5 TMG</h2>
					<p>
						Lennard Scheibel
						<br />
						E-Mail:{" "}
						<a
							className="underline decoration-hairline-strong underline-offset-2"
							href="mailto:hideandseek@lennardscheibel.de"
						>
							hideandseek@lennardscheibel.de
						</a>
					</p>
				</section>

				<section className="flex flex-col gap-1.5" lang="de">
					<h2 className="text-base">
						Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
					</h2>
					<p>Lennard Scheibel</p>
				</section>

				<section className="flex flex-col gap-1.5" lang="de">
					<h2 className="text-base">Haftung für Inhalte</h2>
					<p className="text-ink-dim">
						Als Diensteanbieter bin ich gemäß § 7 Abs. 1 TMG für eigene Inhalte
						auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach
						§§ 8 bis 10 TMG bin ich als Diensteanbieter jedoch nicht
						verpflichtet, übermittelte oder gespeicherte fremde Informationen zu
						überwachen oder nach Umständen zu forschen, die auf eine
						rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung
						oder Sperrung der Nutzung von Informationen nach den allgemeinen
						Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist
						erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung
						möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen
						werde ich diese Inhalte umgehend entfernen.
					</p>
				</section>

				<section className="flex flex-col gap-1.5" lang="de">
					<h2 className="text-base">Haftung für Links</h2>
					<p className="text-ink-dim">
						Dieses Angebot enthält Links zu externen Websites Dritter, auf deren
						Inhalte ich keinen Einfluss habe. Deshalb kann ich für diese fremden
						Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten
						Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten
						verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt der
						Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige
						Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine
						permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch
						ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar.
						Bei Bekanntwerden von Rechtsverletzungen werde ich derartige Links
						umgehend entfernen.
					</p>
				</section>

				<section className="flex flex-col gap-1.5" lang="de">
					<h2 className="text-base">Urheberrecht</h2>
					<p className="text-ink-dim">
						Die durch die Seitenbetreiber erstellten Inhalte und Werke auf
						diesen Seiten unterliegen dem deutschen Urheberrecht. Die
						Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
						Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der
						schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
					</p>
				</section>

				<section className="flex flex-col gap-1.5" lang="de">
					<h2 className="text-base">Hinweis</h2>
					<p className="text-ink-dim">
						Dies ist ein inoffizieller, nicht-kommerzieller Companion zu „Jet
						Lag: The Game – Hide + Seek“. Es besteht keine Verbindung zu
						Wendover Productions oder den Machern des Spiels. Das physische
						Spiel wird durch diesen Companion nicht ersetzt.
					</p>
				</section>

				<p className="pt-2">
					<a
						className="text-ink-dim text-xs hover:text-ink"
						href="https://lennardscheibel.de"
						rel="noreferrer"
						target="_blank"
					>
						made with 💛
					</a>
				</p>
			</ScreenBody>
		</Screen>
	);
}
