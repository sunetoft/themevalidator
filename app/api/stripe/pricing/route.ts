import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      // Fallback to default price if Stripe isn't configured
      return NextResponse.json({
        price: '$25',
        priceDecimal: '25.00',
        currency: 'usd',
        interval: 'month',
        source: 'fallback',
      })
    }

    const stripe = new Stripe(stripeKey)

    // Fetch active recurring prices
    const prices = await stripe.prices.list({
      active: true,
      type: 'recurring',
      expand: ['data.product'],
      limit: 10,
    })

    // Find the default/primary subscription price
    const primaryPrice = prices.data.find(p =>
      p.recurring?.interval === 'month' &&
      (p.metadata?.default === 'true' || p.metadata?.tier === 'pro')
    ) ?? prices.data[0]

    if (!primaryPrice) {
      return NextResponse.json({
        price: '$25',
        priceDecimal: '25.00',
        currency: 'usd',
        interval: 'month',
        source: 'fallback',
      })
    }

    const amount = (primaryPrice.unit_amount ?? 2500) / 100
    const currency = (primaryPrice.currency ?? 'usd').toUpperCase()
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : ''

    return NextResponse.json({
      price: `${symbol}${amount}`,
      priceDecimal: amount.toFixed(2),
      currency: primaryPrice.currency ?? 'usd',
      interval: primaryPrice.recurring?.interval ?? 'month',
      priceId: primaryPrice.id,
      productName: (primaryPrice.product as Stripe.Product)?.name ?? 'Pro',
      source: 'stripe',
    })
  } catch (err: any) {
    console.error('Stripe pricing fetch error:', err?.message)
    return NextResponse.json({
      price: '$25',
      priceDecimal: '25.00',
      currency: 'usd',
      interval: 'month',
      source: 'fallback',
      error: err?.message,
    })
  }
}
