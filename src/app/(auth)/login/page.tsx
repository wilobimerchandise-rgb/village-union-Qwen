  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    // 1. Sign in
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("Sign In Result:", { data, error: signInError });

    if (signInError || !data.user) {
      setError(signInError?.message || "Invalid credentials.");
      setLoading(false);
      return;
    }

    // 2. Fetch ALL memberships for this user (avoids PostgREST enum URL filtering bugs)
    const { data: memberships, error: membershipError } = await supabase
      .from("association_memberships")
      .select("association_id, status, role")
      .eq("user_id", data.user.id);

    console.log("Memberships Query Result:", { memberships, error: membershipError });

    if (membershipError) {
      console.error("Membership Query Failed:", membershipError);
      setError("Database error checking membership. Please try again.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // 3. Find the active membership in JavaScript
    const activeMembership = memberships?.find((m: any) => m.status === 'active');

    if (!activeMembership) {
      await supabase.auth.signOut();
      setError("No active membership found. Contact your administrator.");
      setLoading(false);
      return;
    }

    // 4. Success! Redirect to the specific association dashboard
    console.log("Redirecting to:", `/${activeMembership.association_id}/dashboard`);
    router.push(`/${activeMembership.association_id}/dashboard`);
  };
