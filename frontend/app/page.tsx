import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../components/ui/card";
import { Button } from "../components/ui/button";

export default function Page() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>NetCFG</CardTitle>
          <CardDescription>Ağ cihazlarınız için modern yedekleme ve yönetim</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Platforma erişmek için giriş yapın.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/login">Giriş Yap</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
