import { useState } from "react";
import {
  getGetMyReferralCodeQueryKey,
  useCreateMyReferralCode,
  useGetMyReferralCode,
  useListEligibleReferralPrograms,
  useListMyReferralRewards,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Gift, Loader2, IndianRupee } from "lucide-react";
import { formatPrice } from "@/lib/utils";

export function ReferralsSection() {
  const queryClient = useQueryClient();
  const { data: rewards, isLoading: rewardsLoading } = useListMyReferralRewards();
  const { data: existingCode, isLoading: codeLoading } = useGetMyReferralCode();
  const { data: eligiblePrograms, isLoading: programsLoading } = useListEligibleReferralPrograms();
  const createCode = useCreateMyReferralCode();
  const [code, setCode] = useState("");
  const eligibleProgram = eligiblePrograms?.find((program) => program.active);

  const handleCreateCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 4) {
      toast.error("Code must be at least 4 characters");
      return;
    }
    if (!eligibleProgram) {
      toast.error("No referral program is available right now");
      return;
    }
    createCode.mutate(
      { data: { programId: eligibleProgram.id, code: code.toUpperCase() } },
      {
        onSuccess: () => {
          toast.success(`Referral code ${code.toUpperCase()} created!`);
          setCode("");
          queryClient.invalidateQueries({ queryKey: getGetMyReferralCodeQueryKey() });
        },
        onError: (err: any) => toast.error(err.message || "Failed to create referral code"),
      }
    );
  };

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-br from-primary/10 to-orange-100 dark:from-primary/20 dark:to-orange-900/20 p-6 sm:p-8 rounded-2xl border border-primary/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <Gift className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-serif font-bold text-secondary mb-2">Invite Friends, Earn Rewards</h3>
            <p className="text-sm text-secondary/80 mb-6 max-w-lg">
              Create your custom referral code and share it with friends. When they sign up and book their first stay, you both earn rewards!
            </p>
            
            {codeLoading || programsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            ) : existingCode ? (
              <div className="max-w-sm rounded-xl bg-white/80 p-4 border border-primary/20">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your referral code</p>
                <p className="mt-1 text-2xl font-bold tracking-wider text-primary">{existingCode.code}</p>
              </div>
            ) : !eligibleProgram ? (
              <div className="max-w-sm rounded-xl bg-white/80 p-4 border border-primary/20">
                <p className="font-medium text-secondary">No referral program is available right now.</p>
                <p className="mt-1 text-sm text-muted-foreground">Check back later for the next StayBest referral offer.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-secondary/80 mb-3">
                  {eligibleProgram.name} · Earn {formatPrice(eligibleProgram.referrerReward)} for each qualified referral.
                </p>
                <form onSubmit={handleCreateCode} className="flex gap-3 max-w-sm">
                  <Input
                    placeholder="YOURCODE2024"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="uppercase bg-white/80"
                    maxLength={20}
                  />
                  <Button type="submit" disabled={createCode.isPending}>
                    {createCode.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Create Code
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-serif font-bold text-secondary mb-4">Your Rewards</h3>
        {rewardsLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !rewards || rewards.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-xl border border-border">
            <IndianRupee className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium text-secondary">No rewards yet</p>
            <p className="text-sm text-muted-foreground">Share your code to start earning!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward) => (
              <div key={reward.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    reward.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    <IndianRupee className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary">{reward.rewardType}</p>
                    <p className="text-xs text-muted-foreground">{new Date(reward.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-secondary">{formatPrice(reward.amount)}</p>
                  <p className={`text-xs font-medium capitalize ${
                    reward.status === 'paid' ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {reward.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
