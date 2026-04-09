#!/usr/bin/env node
/* eslint-disable no-console */
const crypto = require('crypto')
const { validateRequest } = require('twilio')

function normalizeTwilioUrl(url) {
  return url.replace(/\/$/, '')
}

function buildTwilioUrlCandidates(reqUrl, publicWebhookUrl) {
  const candidates = new Set()
  const requestUrl = new URL(reqUrl)
  const normalizedPath = `${requestUrl.pathname.replace(/\/$/, '')}${requestUrl.search}`

  candidates.add(normalizeTwilioUrl(requestUrl.toString()))

  if (requestUrl.protocol !== 'https:') {
    candidates.add(normalizeTwilioUrl(`https://${requestUrl.host}${normalizedPath}`))
  }

  if (publicWebhookUrl) {
    const normalizedConfigured = normalizeTwilioUrl(publicWebhookUrl.trim())
    candidates.add(normalizedConfigured)

    const configuredUrl = new URL(normalizedConfigured)
    if (configuredUrl.protocol !== 'https:') {
      candidates.add(
        normalizeTwilioUrl(`https://${configuredUrl.host}${configuredUrl.pathname}${configuredUrl.search}`)
      )
    }
  }

  return Array.from(candidates)
}

function computeTwilioSignature(authToken, url, params) {
  const keys = Object.keys(params).sort()
  let payload = url
  for (const key of keys) payload += key + params[key]
  return crypto.createHmac('sha1', authToken).update(payload).digest('base64')
}

function verifyTwilioSignatureLikeRoute({ authToken, signature, rawBody, reqUrl, publicWebhookUrl }) {
  if (!authToken) return false
  const params = {}
  new URLSearchParams(rawBody).forEach((value, key) => {
    params[key] = value
  })
  const candidateUrls = buildTwilioUrlCandidates(reqUrl, publicWebhookUrl)
  return candidateUrls.some((candidateUrl) => validateRequest(authToken, signature, candidateUrl, params))
}

function shouldBlockTestEndpoint(nodeEnv, allowTestEndpoint) {
  return nodeEnv === 'production' && allowTestEndpoint !== 'true'
}

function sendGuard(nodeEnv, whatsappDevMode) {
  const isProduction = nodeEnv === 'production'
  const isDevMode = whatsappDevMode === 'true'
  if (isProduction && isDevMode) {
    throw new Error('WHATSAPP_DEV_MODE cannot be enabled in a production environment.')
  }
  return isDevMode ? 'mock' : 'real'
}

let failures = 0
const pass = (msg) => console.log(`PASS ${msg}`)
const fail = (msg) => {
  failures += 1
  console.log(`FAIL ${msg}`)
}

const token = 'test_token_123'
const params = {
  Body: 'confirm',
  From: 'whatsapp:+15550001111',
  MessageSid: 'SM-123',
}
const rawBody = 'Body=confirm&From=whatsapp%3A%2B15550001111&MessageSid=SM-123'

console.log('=== SECURITY HARDENING ===')
{
  const signedUrl = 'https://clinic.example.com/api/whatsapp/webhook'
  const validSignature = computeTwilioSignature(token, signedUrl, params)

  const valid = verifyTwilioSignatureLikeRoute({
    authToken: token,
    signature: validSignature,
    rawBody,
    reqUrl: signedUrl,
    publicWebhookUrl: '',
  })
  valid ? pass('valid signature accepted') : fail('valid signature accepted')

  const missing = verifyTwilioSignatureLikeRoute({
    authToken: token,
    signature: '',
    rawBody,
    reqUrl: signedUrl,
    publicWebhookUrl: '',
  })
  !missing ? pass('missing signature rejected') : fail('missing signature rejected')

  const invalid = verifyTwilioSignatureLikeRoute({
    authToken: token,
    signature: 'invalid-signature',
    rawBody,
    reqUrl: signedUrl,
    publicWebhookUrl: '',
  })
  !invalid ? pass('invalid signature rejected') : fail('invalid signature rejected')

  const trailingSlashReq = verifyTwilioSignatureLikeRoute({
    authToken: token,
    signature: validSignature,
    rawBody,
    reqUrl: `${signedUrl}/`,
    publicWebhookUrl: '',
  })
  trailingSlashReq ? pass('trailing slash mismatch handled') : fail('trailing slash mismatch handled')

  const proxyHttpsViaPublicUrl = verifyTwilioSignatureLikeRoute({
    authToken: token,
    signature: validSignature,
    rawBody,
    reqUrl: 'http://localhost:3000/api/whatsapp/webhook',
    publicWebhookUrl: signedUrl,
  })
  proxyHttpsViaPublicUrl
    ? pass('proxy/domain mismatch handled via derived candidates + explicit public URL')
    : fail('proxy/domain mismatch handled via derived candidates + explicit public URL')
}

console.log('=== TEST ENDPOINT LOCKDOWN ===')
{
  const blockedProd = shouldBlockTestEndpoint('production', undefined)
  blockedProd ? pass('production blocked when ALLOW_TEST_ENDPOINT not true') : fail('production blocked when ALLOW_TEST_ENDPOINT not true')

  const allowedProdOverride = shouldBlockTestEndpoint('production', 'true')
  !allowedProdOverride ? pass('production override allows endpoint when explicitly enabled') : fail('production override allows endpoint when explicitly enabled')

  const allowedDev = shouldBlockTestEndpoint('development', undefined)
  !allowedDev ? pass('non-production not blocked by production guard') : fail('non-production not blocked by production guard')
}

console.log('=== DEV MODE SAFETY ===')
{
  let threw = false
  try {
    sendGuard('production', 'true')
  } catch {
    threw = true
  }
  threw ? pass('production + WHATSAPP_DEV_MODE=true hard-fails') : fail('production + WHATSAPP_DEV_MODE=true hard-fails')

  const prodReal = sendGuard('production', 'false')
  prodReal === 'real' ? pass('production + WHATSAPP_DEV_MODE=false uses real send path') : fail('production + WHATSAPP_DEV_MODE=false uses real send path')

  const devMock = sendGuard('development', 'true')
  devMock === 'mock' ? pass('development + WHATSAPP_DEV_MODE=true uses mock send path') : fail('development + WHATSAPP_DEV_MODE=true uses mock send path')
}

console.log('=== RESULT ===')
if (failures > 0) {
  console.log(`FAILURES=${failures}`)
  process.exit(1)
}
console.log('ALL_PASS')
