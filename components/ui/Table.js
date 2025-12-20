import React from 'react'

export default function Table({ columns, data }) {
  return (
    <div className="table-container">
      <table className="premium-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={col.accessor || i}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty-cell">
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={i}>
                {columns.map((col, j) => (
                  <td key={col.accessor || j}>
                    {col.cell ? col.cell(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <style jsx>{`
        .table-container {
          width: 100%;
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: white;
        }
        .premium-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
          text-align: left;
        }
        .premium-table th {
          padding: 12px 16px;
          background: linear-gradient(to bottom, #ffffff 0%, #fafafa 100%);
          color: #1f2937;
          font-weight: 700;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #f97316;
        }
        .premium-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f3f4f6;
          color: #1f2937;
          vertical-align: middle;
        }
        .premium-table tbody tr:last-child td {
          border-bottom: none;
        }
        .premium-table tbody tr:hover {
          background-color: #f9fafb;
        }
        .empty-cell {
          text-align: center;
          padding: 32px;
          color: #9ca3af;
          font-style: italic;
        }
      `}</style>
    </div>
  )
}
