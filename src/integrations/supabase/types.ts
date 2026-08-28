export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      company_settings: {
        Row: {
          available_capital: number
          created_at: string
          default_tax_pct: number
          id: string
          min_margin_pct: number
          owner_id: string
          score_green_min: number
          score_yellow_min: number
          service_cities: string[]
          service_states: string[]
          updated_at: string
        }
        Insert: {
          available_capital?: number
          created_at?: string
          default_tax_pct?: number
          id?: string
          min_margin_pct?: number
          owner_id: string
          score_green_min?: number
          score_yellow_min?: number
          service_cities?: string[]
          service_states?: string[]
          updated_at?: string
        }
        Update: {
          available_capital?: number
          created_at?: string
          default_tax_pct?: number
          id?: string
          min_margin_pct?: number
          owner_id?: string
          score_green_min?: number
          score_yellow_min?: number
          service_cities?: string[]
          service_states?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      edital_analyses: {
        Row: {
          ai_model_used: string | null
          certificates_info: string | null
          created_at: string
          dates_json: Json | null
          delivery_info: string | null
          habilitation_info: string | null
          id: string
          items_json: Json | null
          object_extracted: string | null
          opportunity_id: string
          payment_info: string | null
          pdf_storage_path: string | null
          penalties_info: string | null
          required_documents: string[] | null
          risk_points: string[] | null
          samples_info: string | null
          status: string
          updated_at: string
          values_json: Json | null
          warranties_info: string | null
        }
        Insert: {
          ai_model_used?: string | null
          certificates_info?: string | null
          created_at?: string
          dates_json?: Json | null
          delivery_info?: string | null
          habilitation_info?: string | null
          id?: string
          items_json?: Json | null
          object_extracted?: string | null
          opportunity_id: string
          payment_info?: string | null
          pdf_storage_path?: string | null
          penalties_info?: string | null
          required_documents?: string[] | null
          risk_points?: string[] | null
          samples_info?: string | null
          status?: string
          updated_at?: string
          values_json?: Json | null
          warranties_info?: string | null
        }
        Update: {
          ai_model_used?: string | null
          certificates_info?: string | null
          created_at?: string
          dates_json?: Json | null
          delivery_info?: string | null
          habilitation_info?: string | null
          id?: string
          items_json?: Json | null
          object_extracted?: string | null
          opportunity_id?: string
          payment_info?: string | null
          pdf_storage_path?: string | null
          penalties_info?: string | null
          required_documents?: string[] | null
          risk_points?: string[] | null
          samples_info?: string | null
          status?: string
          updated_at?: string
          values_json?: Json | null
          warranties_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edital_analyses_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_simulations: {
        Row: {
          cash_flow_impact: Json | null
          created_at: string
          freight_cost: number | null
          id: string
          margin_pct: number | null
          max_recommended_bid: number | null
          opportunity_id: string
          other_costs: number | null
          owner_id: string
          product_cost: number | null
          profit: number | null
          required_capital: number | null
          revenue: number | null
          selected_supplier_id: string | null
          tax_cost: number | null
          updated_at: string
        }
        Insert: {
          cash_flow_impact?: Json | null
          created_at?: string
          freight_cost?: number | null
          id?: string
          margin_pct?: number | null
          max_recommended_bid?: number | null
          opportunity_id: string
          other_costs?: number | null
          owner_id: string
          product_cost?: number | null
          profit?: number | null
          required_capital?: number | null
          revenue?: number | null
          selected_supplier_id?: string | null
          tax_cost?: number | null
          updated_at?: string
        }
        Update: {
          cash_flow_impact?: Json | null
          created_at?: string
          freight_cost?: number | null
          id?: string
          margin_pct?: number | null
          max_recommended_bid?: number | null
          opportunity_id?: string
          other_costs?: number | null
          owner_id?: string
          product_cost?: number | null
          profit?: number | null
          required_capital?: number | null
          revenue?: number | null
          selected_supplier_id?: string | null
          tax_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_simulations_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_simulations_selected_supplier_id_fkey"
            columns: ["selected_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          opportunity_id: string | null
          owner_id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          opportunity_id?: string | null
          owner_id: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          opportunity_id?: string | null
          owner_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          agency_name: string | null
          category: string | null
          catmat_catser_code: string | null
          city: string | null
          closing_date: string | null
          created_at: string
          delivery_deadline_days: number | null
          estimated_value: number | null
          id: string
          is_compatible: boolean
          is_me_epp: boolean | null
          modality: string | null
          object_description: string | null
          owner_id: string
          payment_deadline_days: number | null
          process_number: string | null
          quantity: number | null
          raw_payload: Json | null
          requires_certificate: boolean | null
          requires_min_capital: boolean | null
          requires_sample: boolean | null
          requires_warranty: boolean | null
          session_date: string | null
          source_external_id: string
          source_id: string
          source_url: string
          state: string | null
          status_situation: string | null
          updated_at: string
        }
        Insert: {
          agency_name?: string | null
          category?: string | null
          catmat_catser_code?: string | null
          city?: string | null
          closing_date?: string | null
          created_at?: string
          delivery_deadline_days?: number | null
          estimated_value?: number | null
          id?: string
          is_compatible?: boolean
          is_me_epp?: boolean | null
          modality?: string | null
          object_description?: string | null
          owner_id: string
          payment_deadline_days?: number | null
          process_number?: string | null
          quantity?: number | null
          raw_payload?: Json | null
          requires_certificate?: boolean | null
          requires_min_capital?: boolean | null
          requires_sample?: boolean | null
          requires_warranty?: boolean | null
          session_date?: string | null
          source_external_id: string
          source_id: string
          source_url: string
          state?: string | null
          status_situation?: string | null
          updated_at?: string
        }
        Update: {
          agency_name?: string | null
          category?: string | null
          catmat_catser_code?: string | null
          city?: string | null
          closing_date?: string | null
          created_at?: string
          delivery_deadline_days?: number | null
          estimated_value?: number | null
          id?: string
          is_compatible?: boolean
          is_me_epp?: boolean | null
          modality?: string | null
          object_description?: string | null
          owner_id?: string
          payment_deadline_days?: number | null
          process_number?: string | null
          quantity?: number | null
          raw_payload?: Json | null
          requires_certificate?: boolean | null
          requires_min_capital?: boolean | null
          requires_sample?: boolean | null
          requires_warranty?: boolean | null
          session_date?: string | null
          source_external_id?: string
          source_id?: string
          source_url?: string
          state?: string | null
          status_situation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_products: {
        Row: {
          created_at: string
          id: string
          match_reason: string | null
          opportunity_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_reason?: string | null
          opportunity_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_reason?: string | null
          opportunity_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_products_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_scores: {
        Row: {
          classification: string
          computed_at: string
          factors: Json
          id: string
          opportunity_id: string
          reasons: string[]
          score: number
        }
        Insert: {
          classification: string
          computed_at?: string
          factors: Json
          id?: string
          opportunity_id: string
          reasons?: string[]
          score: number
        }
        Update: {
          classification?: string
          computed_at?: string
          factors?: Json
          id?: string
          opportunity_id?: string
          reasons?: string[]
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_scores_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      participation_history: {
        Row: {
          actual_margin_pct: number | null
          actual_profit: number | null
          agency_name: string | null
          competitors_count: number | null
          created_at: string
          id: string
          main_product_id: string | null
          opportunity_id: string | null
          our_bid_value: number | null
          owner_id: string
          recorded_at: string
          result: string
          updated_at: string
          winning_value: number | null
        }
        Insert: {
          actual_margin_pct?: number | null
          actual_profit?: number | null
          agency_name?: string | null
          competitors_count?: number | null
          created_at?: string
          id?: string
          main_product_id?: string | null
          opportunity_id?: string | null
          our_bid_value?: number | null
          owner_id: string
          recorded_at?: string
          result: string
          updated_at?: string
          winning_value?: number | null
        }
        Update: {
          actual_margin_pct?: number | null
          actual_profit?: number | null
          agency_name?: string | null
          competitors_count?: number | null
          created_at?: string
          id?: string
          main_product_id?: string | null
          opportunity_id?: string | null
          our_bid_value?: number | null
          owner_id?: string
          recorded_at?: string
          result?: string
          updated_at?: string
          winning_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "participation_history_main_product_id_fkey"
            columns: ["main_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participation_history_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_items: {
        Row: {
          created_at: string
          id: string
          is_discarded: boolean
          is_favorite: boolean
          notes: string | null
          opportunity_id: string
          owner_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_discarded?: boolean
          is_favorite?: boolean
          notes?: string | null
          opportunity_id: string
          owner_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_discarded?: boolean
          is_favorite?: boolean
          notes?: string | null
          opportunity_id?: string
          owner_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_items_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suppliers: {
        Row: {
          created_at: string
          freight_cost: number | null
          id: string
          lead_time_days: number | null
          owner_id: string
          payment_terms_days: number | null
          product_id: string
          supplier_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          freight_cost?: number | null
          id?: string
          lead_time_days?: number | null
          owner_id: string
          payment_terms_days?: number | null
          product_id: string
          supplier_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          freight_cost?: number | null
          id?: string
          lead_time_days?: number | null
          owner_id?: string
          payment_terms_days?: number | null
          product_id?: string
          supplier_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          avg_purchase_price: number | null
          category: string | null
          catmat_catser_code: string | null
          created_at: string
          freight_cost: number | null
          id: string
          is_active: boolean
          keywords: string[]
          min_margin_pct: number | null
          name: string
          owner_id: string
          supply_lead_time_days: number | null
          updated_at: string
        }
        Insert: {
          avg_purchase_price?: number | null
          category?: string | null
          catmat_catser_code?: string | null
          created_at?: string
          freight_cost?: number | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          min_margin_pct?: number | null
          name: string
          owner_id: string
          supply_lead_time_days?: number | null
          updated_at?: string
        }
        Update: {
          avg_purchase_price?: number | null
          category?: string | null
          catmat_catser_code?: string | null
          created_at?: string
          freight_cost?: number | null
          id?: string
          is_active?: boolean
          keywords?: string[]
          min_margin_pct?: number | null
          name?: string
          owner_id?: string
          supply_lead_time_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          integration_type: string
          is_active: boolean
          last_synced_at: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          integration_type: string
          is_active?: boolean
          last_synced_at?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          last_synced_at?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          contact_info: string | null
          created_at: string
          default_freight_cost: number | null
          id: string
          name: string
          owner_id: string
          payment_terms_days: number | null
          updated_at: string
        }
        Insert: {
          contact_info?: string | null
          created_at?: string
          default_freight_cost?: number | null
          id?: string
          name: string
          owner_id: string
          payment_terms_days?: number | null
          updated_at?: string
        }
        Update: {
          contact_info?: string | null
          created_at?: string
          default_freight_cost?: number | null
          id?: string
          name?: string
          owner_id?: string
          payment_terms_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          opportunities_found: number | null
          source_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          opportunities_found?: number | null
          source_id: string
          started_at?: string | null
          status: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          opportunities_found?: number | null
          source_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
