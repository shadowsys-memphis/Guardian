import { useEffect } from "react";
import { useLocation } from "wouter";

export function GuardianSuccessPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/");
  }, [navigate]);

  return null;
}
