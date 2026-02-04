import WebBills, { getServerSideProps as webSSP } from '../../page-variants/order/bills.web'
import NativeBills from '../../page-variants/order/bills.native'

const isNative = process.env.NATIVE_BUILD === '1'

export const getServerSideProps = isNative ? async () => ({ props: {} }) : webSSP

export default isNative ? NativeBills : WebBills

