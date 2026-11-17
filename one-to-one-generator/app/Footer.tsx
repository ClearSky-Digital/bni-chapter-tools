const linkClass = 'font-semibold text-[#A61926] underline underline-offset-2 hover:text-[#7F1D1D]';

export default function Footer() {
  return (
    <footer className="max-w-7xl mx-auto mt-12 px-4 sm:px-6 text-xs leading-relaxed text-slate-600 print:mt-2 print:px-0 print:text-[9px] print:leading-snug">
      <div className="border-t border-slate-300 pt-5 grid gap-2 print:pt-1 print:gap-0.5">
        <p>
          Made by{' '}
          <a href="https://cscloud.digital/" rel="noopener" className={linkClass}>
            ClearSky Digital
          </a>
          . BNI member? See the{' '}
          <a href="https://cscloud.digital/bni-optimizer/" rel="noopener" className={linkClass}>
            BNI Optimizer
          </a>
          .
        </p>
        <p>
          Your roster stays in your browser and goes nowhere else. The last four runs are kept in this
          browser to avoid repeat pairs; use the Clear History button to remove them.
        </p>
        <div className="print:hidden flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>Featured on</span>
          <a href="https://www.tinyshelf.co/?ref=apps.cscloud.digital" title="Featured on TinyShelf">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://www.tinyshelf.co/badge/tinyshelf-badge-light-5ca4026a.svg"
              alt="Featured on TinyShelf"
              width="216"
              height="64"
              className="max-w-full h-auto"
            />
          </a>
          {/* TODO: TinyLaunch badge, snippet not found; paste official embed here */}
        </div>
        <p>BNI is a trademark of its owner. This tool is not made or endorsed by BNI.</p>
      </div>
    </footer>
  );
}
