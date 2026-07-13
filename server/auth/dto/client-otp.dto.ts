export type RequestOtpDto = {
  phone: string
}

export type VerifyOtpDto = {
  phone: string
  code: string
}
