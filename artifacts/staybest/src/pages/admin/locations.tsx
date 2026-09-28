import React from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LegacyLocations } from "./locations-tabs/LegacyLocations";
import { PostalDirectory } from "./locations-tabs/PostalDirectory";
import { MapPin, Globe } from "lucide-react";

export default function AdminLocations() {
  return (
    <AdminLayout title="Locations">
      <div className="mb-6">
        <p className="text-muted-foreground">
          Manage the countries, states, districts, cities, areas, and pincodes available in property forms.
        </p>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="mb-6 h-auto p-1 bg-white border shadow-sm rounded-xl inline-flex w-full sm:w-auto">
          <TabsTrigger
            value="active"
            className="flex-1 sm:flex-none justify-center gap-2 rounded-lg py-2.5 px-6 data-[state=active]:bg-primary data-[state=active]:text-white font-medium"
          >
            <MapPin className="w-4 h-4" />
            Active Database
          </TabsTrigger>
          <TabsTrigger
            value="directory"
            className="flex-1 sm:flex-none justify-center gap-2 rounded-lg py-2.5 px-6 data-[state=active]:bg-primary data-[state=active]:text-white font-medium"
          >
            <Globe className="w-4 h-4" />
            Postal Directory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-0 outline-none ring-0">
          <LegacyLocations />
        </TabsContent>

        <TabsContent value="directory" className="mt-0 outline-none ring-0">
          <PostalDirectory />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
