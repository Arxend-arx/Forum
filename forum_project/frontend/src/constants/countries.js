// 常用国家/地区列表（ISO-3166 代码 + 中英文名），用于国籍选择与国旗展示
export const COUNTRIES = [
  { code: 'CN', zh: '中国', en: 'China' },
  { code: 'HK', zh: '中国香港', en: 'Hong Kong SAR' },
  { code: 'MO', zh: '中国澳门', en: 'Macao SAR' },
  { code: 'TW', zh: '中国台湾', en: 'Taiwan' },
  { code: 'US', zh: '美国', en: 'United States' },
  { code: 'GB', zh: '英国', en: 'United Kingdom' },
  { code: 'JP', zh: '日本', en: 'Japan' },
  { code: 'KR', zh: '韩国', en: 'South Korea' },
  { code: 'SG', zh: '新加坡', en: 'Singapore' },
  { code: 'MY', zh: '马来西亚', en: 'Malaysia' },
  { code: 'TH', zh: '泰国', en: 'Thailand' },
  { code: 'VN', zh: '越南', en: 'Vietnam' },
  { code: 'ID', zh: '印度尼西亚', en: 'Indonesia' },
  { code: 'PH', zh: '菲律宾', en: 'Philippines' },
  { code: 'MM', zh: '缅甸', en: 'Myanmar' },
  { code: 'KH', zh: '柬埔寨', en: 'Cambodia' },
  { code: 'LA', zh: '老挝', en: 'Laos' },
  { code: 'IN', zh: '印度', en: 'India' },
  { code: 'PK', zh: '巴基斯坦', en: 'Pakistan' },
  { code: 'BD', zh: '孟加拉国', en: 'Bangladesh' },
  { code: 'LK', zh: '斯里兰卡', en: 'Sri Lanka' },
  { code: 'NP', zh: '尼泊尔', en: 'Nepal' },
  { code: 'IR', zh: '伊朗', en: 'Iran' },
  { code: 'IQ', zh: '伊拉克', en: 'Iraq' },
  { code: 'IL', zh: '以色列', en: 'Israel' },
  { code: 'TR', zh: '土耳其', en: 'Türkiye' },
  { code: 'AE', zh: '阿联酋', en: 'United Arab Emirates' },
  { code: 'SA', zh: '沙特阿拉伯', en: 'Saudi Arabia' },
  { code: 'KZ', zh: '哈萨克斯坦', en: 'Kazakhstan' },
  { code: 'UZ', zh: '乌兹别克斯坦', en: 'Uzbekistan' },
  { code: 'FR', zh: '法国', en: 'France' },
  { code: 'DE', zh: '德国', en: 'Germany' },
  { code: 'IT', zh: '意大利', en: 'Italy' },
  { code: 'ES', zh: '西班牙', en: 'Spain' },
  { code: 'PT', zh: '葡萄牙', en: 'Portugal' },
  { code: 'NL', zh: '荷兰', en: 'Netherlands' },
  { code: 'BE', zh: '比利时', en: 'Belgium' },
  { code: 'CH', zh: '瑞士', en: 'Switzerland' },
  { code: 'AT', zh: '奥地利', en: 'Austria' },
  { code: 'SE', zh: '瑞典', en: 'Sweden' },
  { code: 'NO', zh: '挪威', en: 'Norway' },
  { code: 'DK', zh: '丹麦', en: 'Denmark' },
  { code: 'FI', zh: '芬兰', en: 'Finland' },
  { code: 'IE', zh: '爱尔兰', en: 'Ireland' },
  { code: 'GR', zh: '希腊', en: 'Greece' },
  { code: 'PL', zh: '波兰', en: 'Poland' },
  { code: 'CZ', zh: '捷克', en: 'Czechia' },
  { code: 'HU', zh: '匈牙利', en: 'Hungary' },
  { code: 'RO', zh: '罗马尼亚', en: 'Romania' },
  { code: 'UA', zh: '乌克兰', en: 'Ukraine' },
  { code: 'RU', zh: '俄罗斯', en: 'Russia' },
  { code: 'CA', zh: '加拿大', en: 'Canada' },
  { code: 'MX', zh: '墨西哥', en: 'Mexico' },
  { code: 'BR', zh: '巴西', en: 'Brazil' },
  { code: 'AR', zh: '阿根廷', en: 'Argentina' },
  { code: 'CL', zh: '智利', en: 'Chile' },
  { code: 'CO', zh: '哥伦比亚', en: 'Colombia' },
  { code: 'PE', zh: '秘鲁', en: 'Peru' },
  { code: 'AU', zh: '澳大利亚', en: 'Australia' },
  { code: 'NZ', zh: '新西兰', en: 'New Zealand' },
  { code: 'EG', zh: '埃及', en: 'Egypt' },
  { code: 'ZA', zh: '南非', en: 'South Africa' },
  { code: 'NG', zh: '尼日利亚', en: 'Nigeria' },
  { code: 'KE', zh: '肯尼亚', en: 'Kenya' },
  { code: 'ET', zh: '埃塞俄比亚', en: 'Ethiopia' },
]

// ISO-3166 代码 → 国旗 emoji（🇨🇳 由区域指示符组成）
export function flagEmoji(code) {
  if (!code) return ''
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
}

// 国家代码 → 本地化名称（lang: 'zh' | 'en'；未知代码原样返回）
export function countryName(code, lang) {
  if (!code) return ''
  const c = COUNTRIES.find((x) => x.code === code.toUpperCase())
  if (!c) return code
  return lang === 'en' ? c.en : c.zh
}

// 国旗 + 名称组合展示（如 "🇨🇳 中国"）
export function countryLabel(code, lang) {
  if (!code) return ''
  return `${flagEmoji(code)} ${countryName(code, lang)}`
}
