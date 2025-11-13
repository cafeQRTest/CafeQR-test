// pages/faq.js
import Image from 'next/image'
import Link from 'next/link'

export default function FAQPage() {
  const faqs = [
    { question: "How quickly can I set up my restaurant?", answer: "Less than 5 minutes! Just sign up, add your menu items, and generate your QR code. You'll be ready to serve customers immediately." },
    { question: "Do customers need to download an app?", answer: "No! Customers just scan your QR code and order directly from their web browser. No downloads required." },
    { question: "What payment methods do you support?", answer: "All major UPI apps (PhonePe, Google Pay, Paytm, BHIM) and credit/debit cards via our secure Razorpay integration." },
    { question: "Is there a setup fee?", answer: "Absolutely no setup fees! We only charge a small 2% transaction fee on successful payments." },
    { question: "Can I update my menu anytime?", answer: "Yes! Update your menu, prices, and availability in real-time from your dashboard. Changes reflect instantly on customer devices." },
    { question: "How do I know when I receive orders?", answer: "You'll get instant notifications on your dashboard  for every new order. Track everything in real-time." },
    { question: "What if customers have payment issues?", answer: "Our support team is available 24/7 to help with any payment or technical issues. We also provide phone support for urgent matters." },
    { question: "Can I use this for takeaway orders?", answer: "Absolutely! Generate QR codes for tables, counters, or even print them on flyers for takeaway orders." },
    { question: "Is my data secure?", answer: "Yes! We use enterprise-grade security with SSL encryption. All payments are processed securely through Razorpay, a PCI DSS compliant payment gateway." },
    { question: "Do you provide training?", answer: "Yes! We provide free onboarding support and training to help you get the most out of Cafe QR." }
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f6f8fc 0%, #e9ecef 100%)',
      fontFamily: '"Inter", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
      padding: '40px 20px'
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Image
            src="/cafeqr-logo.svg"
            alt="Cafe QR Logo"
            width={48}
            height={48}
            style={{ marginRight: 16, height: "auto" }}
            priority
          />
          <h1 style={{ fontWeight: 800, fontSize: 32, margin: 0, color: '#2c3e50' }}>
            Cafe QR
          </h1>
        </div>
        <h2 style={{ fontSize: 28, color: '#34495e', fontWeight: 600, marginBottom: 16 }}>
          Frequently Asked Questions
        </h2>
        <p style={{ color: '#7f8c8d', fontSize: 18 }}>
          Everything you need to know about Cafe QR
        </p>
      </div>

      {/* FAQ Section */}
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {faqs.map((faq, index) => (
          <div key={index} style={{
            background: '#fff',
            borderRadius: 15,
            padding: '25px 30px',
            marginBottom: 20,
            boxShadow: '0 5px 20px rgba(0,0,0,0.1)',
            border: '1px solid #ecf0f1'
          }}>
            <h4 style={{
              color: '#2c3e50',
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 12,
              lineHeight: 1.4
            }}>
              {index + 1}. {faq.question}
            </h4>
            <p style={{
              color: '#7f8c8d',
              margin: 0,
              fontSize: 16,
              lineHeight: 1.6
            }}>
              {faq.answer}
            </p>
          </div>
        ))}
      </div>

      {/* Contact Section */}
      <section style={{
        padding: '40px 20px',
        textAlign: 'center',
        marginTop: 60,
        background: '#fff',
        borderRadius: 20,
        maxWidth: 600,
        margin: '60px auto 40px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ color: '#2c3e50', marginBottom: 20, fontSize: 24 }}>
          Still Have Questions?
        </h3>
        <p style={{ color: '#7f8c8d', marginBottom: 30, fontSize: 16 }}>
          Get in touch with our support team
        </p>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="mailto:pnriyas50@gmail.com" style={{
            color: '#3498db', textDecoration: 'none', padding: '12px 24px',
            border: '2px solid #3498db', borderRadius: 8, fontWeight: 600
          }}>
            📧 Email Support
          </a>
          <a href="tel:+917012120844" style={{
            color: '#27ae60', textDecoration: 'none', padding: '12px 24px',
            border: '2px solid #27ae60', borderRadius: 8, fontWeight: 600
          }}>
            📞 Call Us
          </a>
        </div>
      </section>

      {/* Back to Home */}
      <div style={{ textAlign: 'center', marginTop: 40 }}>
        <Link
          href="/"
          className="btn btn-outline-primary btn-raise"
          style={{ color: '#e67e22', borderColor: '#e67e22' }}
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  )
}
