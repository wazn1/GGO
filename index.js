export default {
  // 1. عند فتح رابط الـ Worker مباشرة في المتصفح (عرض الأسعار الحالية)
  async fetch(request, env, ctx) {
    const prices = await getLiveGoldPrice();
    return new Response(JSON.stringify(prices, null, 2), {
      headers: { "content-type": "application/json;charset=UTF-8" }
    });
  },

  // 2. التشغيل التلقائي عبر Cron Trigger (تحديث متجر سلة)
  async scheduled(event, env, ctx) {
    await updateSallaPrices(env);
  }
};

// دالة جلب سعر الذهب المباشر للجرام الصافي (بالريال السعودي)
async function getLiveGoldPrice() {
  try {
    const response = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d", {
      headers: { "User-Agent": "Mozilla/5.0" }
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
    console.error("خطأ في جلب سعر الذهب:", error);
    return null;
  }
}

// دالة حساب السعر النهائي للقطعة شامل المصنعية
function calculateItemPrice(gramPrice, makingFeePerGram, weightInGrams) {
  const totalPrice = (gramPrice + makingFeePerGram) * weightInGrams;
  return Number(totalPrice.toFixed(2));
}

// دالة تحديث أسعار المنتجات في سلة
async function updateSallaPrices(env) {
  const prices = await getLiveGoldPrice();
  if (!prices) return;

  const sallaToken = env.SALLA_ACCESS_TOKEN;
  if (!sallaToken) {
    console.error("SALLA_ACCESS_TOKEN غير معرف في Settings");
    return;
  }

  // ⚙️ [1] إعداد قيمة المصنعية للجرام لكل عيار (بالريال):
  const makingFees = {
    karat24: 0,  // مصنعية عيار 24 للجرام (مثلاً: سبائك)
    karat21: 25, // مصنعية عيار 21 للجرام
    karat18: 35  // مصنعية عيار 18 للجرام
  };

  // 📦 [2] قائمة المنتجات المراد تحديثها في متجرك:
  // (ضع معرف المنتج في سلة PRODUCT_ID، والوزن بالجرام، والعيار)
  const productsToUpdate = [
    {
      id: "123456789", // معرف المنتج في سلة (Product ID)
      weight: 5.5,     // وزن قطعة الذهب بالجرام
      karat: 21        // العيار (18، 21، 24)
    },
    {
      id: "987654321", // منتج آخر
      weight: 3.2,
      karat: 18
    }
  ];

  // 🔄 [3] التكرار على المنتجات وتحديث أسعارها في سلة
  for (const item of productsToUpdate) {
    let baseGramPrice = 0;
    let makingFee = 0;

    if (item.karat === 24) {
      baseGramPrice = prices.gram24;
      makingFee = makingFees.karat24;
    } else if (item.karat === 21) {
      baseGramPrice = prices.gram21;
      makingFee = makingFees.karat21;
    } else if (item.karat === 18) {
      baseGramPrice = prices.gram18;
      makingFee = makingFees.karat18;
    }

    const finalPrice = calculateItemPrice(baseGramPrice, makingFee, item.weight);

    try {
      const response = await fetch(`https://api.salla.dev/admin/v2/products/${item.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${sallaToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          price: finalPrice
        })
      });

      const result = await response.json();
      if (result.success) {
        console.log(`تم تحديث المنتج (${item.id}) بالسعر الجديد: ${finalPrice} ريال`);
      } else {
        console.error(`فشل تحديث المنتج (${item.id}):`, result);
      }
    } catch (err) {
      console.error(`خطأ أثناء الاتصال بـ Salla API للمنتج (${item.id}):`, err);
    }
  }
}
