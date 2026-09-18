import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FACEBOOK_PAGE_ID = "1316337054895264";
const FACEBOOK_PAGE_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN");

// Standard CORS Headers required for browser fetches
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const formDataRequest = await req.formData();
        const message = formDataRequest.get("message") as string;
        const imageFile = formDataRequest.get("image") as File;

        if (!imageFile) {
            return new Response(JSON.stringify({ error: "Image file is required" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // --- 1. Upload Image Staging to Facebook ---
        const formData = new FormData();
        formData.append("source", imageFile);
        formData.append("access_token", FACEBOOK_PAGE_ACCESS_TOKEN);
        formData.append("published", "false");

        const uploadResponse = await fetch(
            `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/photos`,
            { method: "POST", body: formData }
        );

        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(`Facebook Image Upload Failed: ${JSON.stringify(uploadResult)}`);
        const uploadedPhotoId = uploadResult.id;

        // --- 2. Publish Post with the Template Image ---
        const publishResponse = await fetch(
            `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/feed`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: message,
                    attached_media: JSON.stringify([{ media_fbid: uploadedPhotoId }]),
                    access_token: FACEBOOK_PAGE_ACCESS_TOKEN,
                }),
            }
        );

        const publishResult = await publishResponse.json();
        if (publishResult.error) throw new Error(JSON.stringify(publishResult.error));

        return new Response(JSON.stringify({ success: true, postId: publishResult.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});