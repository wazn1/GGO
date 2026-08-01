export default {
  // دالة العمل المجدول (كل 15 دقيقة مثلاً)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateSallaPrices(env));
  },

  // دالة الاستجابة لطلبات الـ HTTP العادية (اختياري للاختبار المباشر)
  async fetch(request, env, ctx) {
    const prices = await getLiveGoldPrice();
    return new Response(JSON.stringify(prices, null, 2), {
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  }
};

// 1. كشط سعر الذهب العالمي
async function getLiveGoldPrice() {
  try {
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const data = await response.json();
    const goldPriceUSD = data.chart.result[0].meta.regularMarketPrice;

    const USD_TO_SAR = 3.75;
    const OUNCE_IN_GRAMS = 31.1034768;
    const gram24SAR = (goldPriceUSD * USD_TO_SAR) / OUNCE_IN_GRAMS;

    return {
      gram24: Number(gram24SAR.toFixed(2)),
      gram21: Number((gram24SAR * (21 / 24)).toFixed(2)),
      gram18: Number((gram24SAR * (18 / 24)).toFixed(2))
    };
  } catch (error) {
    console.error('خطأ في جلب السعر:', error);
    return null;
  }
}

// 2. تحديث المنتجات في سلة
async function updateSallaPrices(env) {
  const prices = await getLiveGoldPrice();
  if (!prices) return;

  // استخدام الـ Token المخزن في بيئة العمل الأسبوعية/السرية
  const sallaToken = env.SALLA_ACCESS_TOKEN;

  // هنا يتم استدعاء API سلة لجلب المنتجات وتحديثها
  // PUT https://api.salla.dev/admin/v2/products/{id}
  console.log('تم حساب الأسعار الجديدة بنجاح:', prices);
}
