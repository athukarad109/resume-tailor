import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        
        <div className={styles.intro}>
          <h1>Let’s get a job</h1>
          <p>
            Tailor your resume for a role or discover contacts at a company.
          </p>
        </div>
        <div className={styles.ctas}>
          <a className={styles.primary} href="/resume">
            Tailor resume
          </a>
          <a className={styles.secondary} href="/contacts">
            Contact discovery
          </a>
        </div>
      </main>
    </div>
  );
}
