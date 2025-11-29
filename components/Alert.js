// components/Alert.js script

export default function Alert({ type = 'info', children }) {
  const styles = {
    error: { color: '#ff0000', bg: '#ffe6e6' },
    success: { color: '#00aa00', bg: '#e6ffe6' },
    info: { color: '#2f5dff', bg: '#e6ecff' }
  }
  const style = styles[type] || styles.info
  
  return (
    <div style={{
      padding: 12,
      backgroundColor: style.bg,
      border: `1px solid ${style.color}`,
      borderRadius: 4,
      marginBottom: 16
    }}>
      {children}
    </div>
  )
}
