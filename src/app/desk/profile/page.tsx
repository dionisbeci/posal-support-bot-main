
"use client";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, resetPassword } = useAuth();
  const { toast } = useToast();

  const handleResetPassword = async () => {
    try {
      await resetPassword();
      toast({
        title: "Password Reset",
        description: "A password reset link has been sent to your email.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send password reset email.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            This is your profile page. You can view your information here.
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input type="email" id="email" defaultValue={user?.email || ""} readOnly />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            You can reset your password here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleResetPassword}>Reset Password</Button>
        </CardContent>
      </Card>
    </div>
  );
}
