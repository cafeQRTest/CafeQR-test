// pages/privacy-policy.js
import Head from 'next/head'

export default function PrivacyPolicy() {
  return (
    <>
      <Head>
        <title>Privacy Policy | Cafe QR</title>
        <meta name="description" content="Privacy Policy for Cafe QR by Sharp INtell" />
      </Head>
      <div style={{ maxWidth: 860, margin: '40px auto', padding: '0 16px', lineHeight: 1.75 }}>
        <h1 style={{ marginBottom: 24 }}>Privacy Policy</h1>
        <p>Last updated: [Nov 14, 2025]</p>

        <p>
          Cafe QR (“we”, “our”, “us”) is operated by Sharp INtell. We are committed to
          protecting your privacy and handling your personal information responsibly. This policy
          explains what data we collect, how we use it, and the choices you have.
        </p>

        <h2>What We Do</h2>
        <p>
          Cafe QR enables diners to scan a QR code, browse menus, place orders, and make payments
          at participating restaurants without downloading an app.
        </p>

        <h2>Information We Collect</h2>
        <ul>
          <li>
            Account and Auth Data: email address, name (when provided), and authentication metadata
            when you sign in via Email/Magic Link or Google (if enabled).
          </li>
          <li>
            Order Data: selected items, special instructions, table identifier, timestamps, and
            order status.
          </li>
          <li>
            Payment Data: We do not store your full payment details. Payments are processed by
            Razorpay. We may receive limited payment status information (e.g., success, failure,
            transaction ID) for reconciliation.
          </li>
          <li>
            Device and Usage Data: IP address, browser type, device type, and pages visited for
            security and analytics purposes.
          </li>
          <li>
            Restaurant Data: menu items, prices, images, and configuration set by the restaurant.
          </li>
        </ul>

        <h2>How We Use Your Information</h2>
        <ul>
          <li>Provide and operate the service (account login, order placement, payment processing).</li>
          <li>Secure the platform, prevent fraud, and troubleshoot issues.</li>
          <li>Improve features, performance, and user experience.</li>
          <li>Communicate with you about orders, updates, or support queries.</li>
          <li>Comply with legal obligations and enforce our terms.</li>
        </ul>

        <h2>Legal Bases (where applicable)</h2>
        <ul>
          <li>Performance of a contract (e.g., processing your orders).</li>
          <li>Legitimate interests (e.g., security, service improvement).</li>
          <li>Consent (e.g., optional marketing or certain analytics/tags).</li>
          <li>Legal obligation (e.g., record keeping, tax, fraud prevention).</li>
        </ul>

        <h2>Sharing and Disclosures</h2>
        <ul>
          <li>
            Payment Processor: Razorpay to process payments and confirm payment status.
          </li>
          <li>
            Authentication & Database: Supabase to provide secure authentication and data storage.
          </li>
          <li>
            Service Providers: Reputable vendors for hosting, analytics, logging, and email—not for
            selling your data.
          </li>
          <li>
            Restaurants: We share relevant order details with the restaurant fulfilling your order.
          </li>
          <li>Legal: If required by law or to protect rights, property, or safety.</li>
        </ul>

        <h2>Data Retention</h2>
        <p>
          We retain personal data only for as long as necessary to provide the service and fulfill
          the purposes outlined here, including legal, accounting, or reporting requirements.
        </p>

        <h2>Security</h2>
        <p>
          We implement technical and organizational measures to protect your data. No method of
          transmission or storage is 100% secure; we continuously improve our protections.
        </p>

        <h2>Your Rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, delete, or restrict
          processing of your personal data. To exercise these rights, contact us at
          <a href="mailto:pnriyas50@gmail.com"> support@cafeqr.com</a>.
        </p>

        <h2>Children’s Privacy</h2>
        <p>
          Our service is not intended for children under the age of 13. We do not knowingly collect
          information from children. If you believe a child has provided us personal data, please
          contact us and we will take appropriate steps.
        </p>

        <h2>International Transfers</h2>
        <p>
          We may process and store information on servers located in different countries. Where
          required, we use appropriate safeguards for cross‑border data transfers.
        </p>

        <h2>Cookies and Similar Technologies</h2>
        <p>
          We may use essential cookies for sign‑in and session management, and optional analytics
          cookies to improve the service. You can control cookie preferences via your browser
          settings. Some features may not function without essential cookies.
        </p>

        <h2>Third‑Party Links</h2>
        <p>
          Our site may contain links to third‑party websites. We are not responsible for their
          privacy practices. Review their policies before providing personal information.
        </p>

        <h2>Contact Us</h2>
        <p>
          If you have questions or requests regarding this policy, contact us at
          <a href="mailto:pnriyas50@gmail.com"> support@cafeqr.com</a> or at :
          <br />
          Cafe QR<br />
          +917012120844
        </p>

        <h2>Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post the new policy on this
          page with an updated “Last updated” date.
        </p>
      </div>
    </>
  )
}
