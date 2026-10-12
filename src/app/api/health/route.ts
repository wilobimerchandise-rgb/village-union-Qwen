import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const { error } = await supabase.rpc("version");
    
    if (error) {
      return NextResponse.json({ status: "error", message: "DB connection failed" }, { status: 500 });
    }
    
    return NextResponse.json({ status: "ok", message: "Database connected" });
  } catch (err) {
    return NextResponse.json({ status: "error", message: "Health check failed" }, { status: 500 });
  }
}
