import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="navbar">
      <Link href="/" className="navbar__brand">
        Let’s get a job
      </Link>
      <div className="navbar__links">
        <Link href="/resume" className="navbar__link">
          Resume tailor
        </Link>
        <Link href="/contacts" className="navbar__link">
          Contact discovery
        </Link>
      </div>
    </nav>
  );
}
