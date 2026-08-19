import { isEmpty, isEmptyArray, isNullOrUndefined } from './helpers'

// 👉 Required Validator
export const requiredValidator = value => {
  if (isNullOrUndefined(value) || isEmptyArray(value) || value === false)
    return 'هذا الحقل مطلوب'
  
  return !!String(value).trim().length || 'هذا الحقل مطلوب'
}

// 👉 Email Validator
export const emailValidator = value => {
  if (isEmpty(value))
    return true
  const re = /^(?:[^<>()[\]\\.,;:\s@"]+(?:\.[^<>()[\]\\.,;:\s@"]+)*|".+")@(?:\[\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\]|(?:[a-z\-\d]+\.)+[a-z]{2,})$/i
  if (Array.isArray(value))
    return value.every(val => re.test(String(val))) || 'الرجاء إدخال بريد إلكتروني صحيح'
  
  return re.test(String(value)) || 'الرجاء إدخال بريد إلكتروني صحيح'
}

// 👉 Password Validator
export const passwordValidator = password => {
  const regExp = /(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%&*()]).{8,}/
  const validPassword = regExp.test(password)
  
  return validPassword || 'يجب أن تتكوّن كلمة المرور من 8 أحرف على الأقل وتتضمّن حرفًا كبيرًا وحرفًا صغيرًا ورقمًا ورمزًا خاصًا'
}

// 👉 Confirm Password Validator
export const confirmedValidator = (value, target) => value === target || 'كلمتا المرور غير متطابقتين'

// 👉 Between Validator
export const betweenValidator = (value, min, max) => {
  const valueAsNumber = Number(value)
  
  return (Number(min) <= valueAsNumber && Number(max) >= valueAsNumber) || `أدخل رقمًا بين ${min} و ${max}`
}

// 👉 Integer Validator
export const integerValidator = value => {
  if (isEmpty(value))
    return true
  if (Array.isArray(value))
    return value.every(val => /^-?\d+$/.test(String(val))) || 'يجب أن يكون هذا الحقل رقمًا صحيحًا'
  
  return /^-?\d+$/.test(String(value)) || 'يجب أن يكون هذا الحقل رقمًا صحيحًا'
}

// 👉 Regex Validator
export const regexValidator = (value, regex) => {
  if (isEmpty(value))
    return true
  let regeX = regex
  if (typeof regeX === 'string')
    regeX = new RegExp(regeX)
  if (Array.isArray(value))
    return value.every(val => regexValidator(val, regeX))
  
  return regeX.test(String(value)) || 'صيغة هذا الحقل غير صحيحة'
}

// 👉 Alpha Validator
export const alphaValidator = value => {
  if (isEmpty(value))
    return true
  
  return /^[A-Z]*$/i.test(String(value)) || 'يجب أن يحتوي هذا الحقل على أحرف فقط'
}

// 👉 URL Validator
export const urlValidator = value => {
  if (isEmpty(value))
    return true
  const re = /^https?:\/\/[^\s$.?#].\S*$/
  
  return re.test(String(value)) || 'الرابط غير صحيح'
}

// 👉 Length Validator
export const lengthValidator = (value, length) => {
  if (isEmpty(value))
    return true
  
  return String(value).length === length || `يجب أن يتكوّن هذا الحقل من ${length} حرفًا`
}

// 👉 Alpha-dash Validator
export const alphaDashValidator = value => {
  if (isEmpty(value))
    return true
  const valueAsString = String(value)
  
  return /^[\w-]*$/.test(valueAsString) || 'يحتوي هذا الحقل على رموز غير مسموح بها'
}
