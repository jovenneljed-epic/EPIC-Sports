import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL") as string,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string
);

serve(async (req) => {
    try {
        const payload = await req.json();
        const eventType = payload?.data?.attributes?.type;

        if (eventType === "payment.paid" || eventType === "link.payment.paid" || eventType === "checkout_session.payment.paid") {
            const paymentData = payload.data.attributes.data;
            const remarks = paymentData?.attributes?.remarks || "";

            // Parse OrgID and Tier from remarks (e.g., "OrgID:123|Tier:essential")
            const orgMatch = remarks.match(/OrgID:\s*([^\|]+)/);
            const tierMatch = remarks.match(/Tier:\s*([^\s]+)/);

            if (orgMatch && orgMatch[1]) {
                const orgId = orgMatch[1].trim();
                const purchasedTier = tierMatch ? tierMatch[1].trim() : 'pro';

                await supabase
                    .from("organizations")
                    .update({
                        tier: purchasedTier,
                        is_pro: purchasedTier === 'pro' || purchasedTier === 'essential',
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", orgId);
            }
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400 });
    }
});