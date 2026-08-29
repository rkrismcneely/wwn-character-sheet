import packageJson from "../package.json";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <strong>Tales Without End · v{packageJson.version}</strong>
      <span>Worlds Without Number SRD 1.0 rules content used under CC0. Fan-made utility; not an official Sine Nomine Publishing product.</span>
    </footer>
  );
}
