import { useEffect, useState } from "react";
import { fetchProfile } from "@/lib/profile";

/**
 * People in the user's household, for the budget minimum (130 000 each).
 * Starts at 1 and updates once the profile is read; any problem keeps 1 (the
 * server still checks the real minimum).
 */
export function useHouseholdSize(): number {
  const [size, setSize] = useState(1);

  useEffect(() => {
    let active = true;
    fetchProfile()
      .then(({ data }) => {
        if (active && data) setSize(data.household_size);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return size;
}
