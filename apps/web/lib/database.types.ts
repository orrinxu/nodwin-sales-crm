export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_relationships: {
        Row: {
          created_at: string
          from_account_id: string
          id: string
          kind: string
          notes: string | null
          to_account_id: string
        }
        Insert: {
          created_at?: string
          from_account_id: string
          id?: string
          kind: string
          notes?: string | null
          to_account_id: string
        }
        Update: {
          created_at?: string
          from_account_id?: string
          id?: string
          kind?: string
          notes?: string | null
          to_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_relationships_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_relationships_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_account_relationships_kind"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["code"]
          },
        ]
      }
      account_tax_ids: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          tax_type: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          tax_type: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          tax_type?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_tax_ids_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_tax_ids_tax_type_fkey"
            columns: ["tax_type"]
            isOneToOne: false
            referencedRelation: "tax_id_types"
            referencedColumns: ["code"]
          },
        ]
      }
      accounts: {
        Row: {
          account_owner_user_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          custom_data: Json
          deleted_at: string | null
          description: string | null
          email_domains: string[] | null
          id: string
          industry: string | null
          legal_name: string | null
          name: string
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          account_owner_user_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          deleted_at?: string | null
          description?: string | null
          email_domains?: string[] | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          account_owner_user_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          deleted_at?: string | null
          description?: string | null
          email_domains?: string[] | null
          id?: string
          industry?: string | null
          legal_name?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_account_owner_user_id_fkey"
            columns: ["account_owner_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "accounts_account_owner_user_id_fkey"
            columns: ["account_owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          account_id: string | null
          body: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          external_thread_id: string | null
          id: string
          metadata: Json
          opportunity_id: string | null
          subject: string | null
          type: string
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          subject?: string | null
          type: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          body?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          external_thread_id?: string | null
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          subject?: string | null
          type?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_alerts: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          created_by: string
          id: string
          message: string
          metadata: Json
          title: string
          type: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          message: string
          metadata?: Json
          title: string
          type?: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          metadata?: Json
          title?: string
          type?: string
        }
        Relationships: []
      }
      ai_daily_caps: {
        Row: {
          active: boolean
          created_at: string
          hard_cap_amount: number
          hard_cap_currency: string
          id: string
          scope_id: string
          scope_kind: string
          soft_cap_amount: number
          soft_cap_currency: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hard_cap_amount: number
          hard_cap_currency?: string
          id?: string
          scope_id: string
          scope_kind: string
          soft_cap_amount: number
          soft_cap_currency?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hard_cap_amount?: number
          hard_cap_currency?: string
          id?: string
          scope_id?: string
          scope_kind?: string
          soft_cap_amount?: number
          soft_cap_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          completion_tokens: number
          cost_amount: number
          cost_currency: string
          feature: Database["public"]["Enums"]["ai_feature"]
          finished_at: string
          id: string
          model: string
          prompt_tokens: number
          provider: Database["public"]["Enums"]["ai_provider"]
          request_id: string
          started_at: string
          status: Database["public"]["Enums"]["ai_call_status"]
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number
          cost_amount?: number
          cost_currency?: string
          feature: Database["public"]["Enums"]["ai_feature"]
          finished_at?: string
          id?: string
          model: string
          prompt_tokens?: number
          provider: Database["public"]["Enums"]["ai_provider"]
          request_id: string
          started_at: string
          status?: Database["public"]["Enums"]["ai_call_status"]
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          cost_amount?: number
          cost_currency?: string
          feature?: Database["public"]["Enums"]["ai_feature"]
          finished_at?: string
          id?: string
          model?: string
          prompt_tokens?: number
          provider?: Database["public"]["Enums"]["ai_provider"]
          request_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["ai_call_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_decisions: {
        Row: {
          comment: string | null
          created_at: string
          decided_by_user_id: string
          decision: Database["public"]["Enums"]["approval_decision_type"]
          id: string
          step_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_by_user_id: string
          decision: Database["public"]["Enums"]["approval_decision_type"]
          id?: string
          step_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_by_user_id?: string
          decision?: Database["public"]["Enums"]["approval_decision_type"]
          id?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_decided_by_user_id_fkey"
            columns: ["decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "approval_decisions_decided_by_user_id_fkey"
            columns: ["decided_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_decisions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "approval_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_instances: {
        Row: {
          business_entity_id: string | null
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          id: string
          opportunity_id: string | null
          status: Database["public"]["Enums"]["approval_status"]
          trigger_stage: Database["public"]["Enums"]["deal_stage"] | null
          triggered_by_user_id: string | null
          updated_at: string
          updated_by: string | null
          workflow_id: string
          workflow_snapshot: Json | null
        }
        Insert: {
          business_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          id?: string
          opportunity_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          trigger_stage?: Database["public"]["Enums"]["deal_stage"] | null
          triggered_by_user_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workflow_id: string
          workflow_snapshot?: Json | null
        }
        Update: {
          business_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          opportunity_id?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          trigger_stage?: Database["public"]["Enums"]["deal_stage"] | null
          triggered_by_user_id?: string | null
          updated_at?: string
          updated_by?: string | null
          workflow_id?: string
          workflow_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_instances_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "approval_instances_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_instances_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          approver_role: Database["public"]["Enums"]["user_role"] | null
          approver_user_id: string | null
          approver_user_ids: string[] | null
          created_at: string
          created_by: string | null
          due_by: string | null
          id: string
          instance_id: string
          mode: Database["public"]["Enums"]["approval_step_mode"] | null
          name: string | null
          status: Database["public"]["Enums"]["approval_step_status"]
          step_order: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approver_role?: Database["public"]["Enums"]["user_role"] | null
          approver_user_id?: string | null
          approver_user_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          due_by?: string | null
          id?: string
          instance_id: string
          mode?: Database["public"]["Enums"]["approval_step_mode"] | null
          name?: string | null
          status?: Database["public"]["Enums"]["approval_step_status"]
          step_order: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approver_role?: Database["public"]["Enums"]["user_role"] | null
          approver_user_id?: string | null
          approver_user_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          due_by?: string | null
          id?: string
          instance_id?: string
          mode?: Database["public"]["Enums"]["approval_step_mode"] | null
          name?: string | null
          status?: Database["public"]["Enums"]["approval_step_status"]
          step_order?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "approval_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "approval_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_thresholds: {
        Row: {
          approver_role: string
          confidential_tier_required: string | null
          created_at: string
          deal_value_threshold: number | null
          discount_threshold_pct: number | null
          entity_id: string
          id: string
          updated_at: string
        }
        Insert: {
          approver_role: string
          confidential_tier_required?: string | null
          created_at?: string
          deal_value_threshold?: number | null
          discount_threshold_pct?: number | null
          entity_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          approver_role?: string
          confidential_tier_required?: string | null
          created_at?: string
          deal_value_threshold?: number | null
          discount_threshold_pct?: number | null
          entity_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_approval_thresholds_entity_id"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflow_steps: {
        Row: {
          approver_kind: string
          approver_role: Database["public"]["Enums"]["user_role"] | null
          approver_user_id: string | null
          approver_user_ids: string[] | null
          created_at: string
          created_by: string | null
          id: string
          mode: Database["public"]["Enums"]["approval_step_mode"] | null
          name: string | null
          step_order: number
          updated_at: string
          updated_by: string | null
          workflow_id: string
        }
        Insert: {
          approver_kind?: string
          approver_role?: Database["public"]["Enums"]["user_role"] | null
          approver_user_id?: string | null
          approver_user_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["approval_step_mode"] | null
          name?: string | null
          step_order: number
          updated_at?: string
          updated_by?: string | null
          workflow_id: string
        }
        Update: {
          approver_kind?: string
          approver_role?: Database["public"]["Enums"]["user_role"] | null
          approver_user_id?: string | null
          approver_user_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["approval_step_mode"] | null
          name?: string | null
          step_order?: number
          updated_at?: string
          updated_by?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflow_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "approval_workflow_steps_approver_user_id_fkey"
            columns: ["approver_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "approval_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflows: {
        Row: {
          active: boolean
          applies_to_entity_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          enforce_gate: boolean
          entity_id: string | null
          entity_type: string
          id: string
          name: string
          trigger_stage: Database["public"]["Enums"]["deal_stage"] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          applies_to_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enforce_gate?: boolean
          entity_id?: string | null
          entity_type: string
          id?: string
          name: string
          trigger_stage?: Database["public"]["Enums"]["deal_stage"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          applies_to_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          enforce_gate?: boolean
          entity_id?: string | null
          entity_type?: string
          id?: string
          name?: string
          trigger_stage?: Database["public"]["Enums"]["deal_stage"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_applies_to_entity_id_fkey"
            columns: ["applies_to_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_workflows_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor_ip: string | null
          actor_source: string
          actor_user_agent: string | null
          actor_user_id: string | null
          changed_fields: Json | null
          id: string
          new_data: Json | null
          occurred_at: string
          old_data: Json | null
          operation: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          actor_ip?: string | null
          actor_source?: string
          actor_user_agent?: string | null
          actor_user_id?: string | null
          changed_fields?: Json | null
          id?: string
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          operation: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          actor_ip?: string | null
          actor_source?: string
          actor_user_agent?: string | null
          actor_user_id?: string | null
          changed_fields?: Json | null
          id?: string
          new_data?: Json | null
          occurred_at?: string
          old_data?: Json | null
          operation?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      auth_allowed_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
        }
        Relationships: []
      }
      business_units: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          custom_data: Json
          entity_id: string | null
          id: string
          kind: Database["public"]["Enums"]["business_unit_kind"]
          manager_user_id: string | null
          name: string
          parent_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          entity_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["business_unit_kind"]
          manager_user_id?: string | null
          name: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          entity_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["business_unit_kind"]
          manager_user_id?: string | null
          name?: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_units_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_units_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "business_units_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_units_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_account_links: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          id: string
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          id?: string
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_account_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_account_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          created_by: string | null
          custom_data: Json
          email: string | null
          full_name: string
          id: string
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          primary_account_id: string | null
          socials: Json
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          primary_account_id?: string | null
          socials?: Json
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          primary_account_id?: string | null
          socials?: Json
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_primary_account_id_fkey"
            columns: ["primary_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job_runs: {
        Row: {
          detail: Json | null
          id: number
          job_name: string
          ran_at: string
          status: string
        }
        Insert: {
          detail?: Json | null
          id?: never
          job_name: string
          ran_at?: string
          status?: string
        }
        Update: {
          detail?: Json | null
          id?: never
          job_name?: string
          ran_at?: string
          status?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          active: boolean
          code: string
          created_at: string
          name: string
          scale: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          name: string
          scale: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          name?: string
          scale?: number
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          account_id: string | null
          category: Database["public"]["Enums"]["document_category"] | null
          chunk_index: number
          content: string
          created_at: string
          created_by: string | null
          document_id: string
          drive_file_id: string
          embedding: string | null
          embedding_dim: number
          embedding_model: string
          id: string
          ingested_at: string
          opportunity_id: string | null
          page_ref: string | null
          updated_at: string
          updated_by: string | null
          uploaded_by: string | null
          visibility_tier: Database["public"]["Enums"]["visibility_tier"]
        }
        Insert: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"] | null
          chunk_index: number
          content: string
          created_at?: string
          created_by?: string | null
          document_id: string
          drive_file_id: string
          embedding?: string | null
          embedding_dim: number
          embedding_model: string
          id?: string
          ingested_at?: string
          opportunity_id?: string | null
          page_ref?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          visibility_tier: Database["public"]["Enums"]["visibility_tier"]
        }
        Update: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"] | null
          chunk_index?: number
          content?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          drive_file_id?: string
          embedding?: string | null
          embedding_dim?: number
          embedding_model?: string
          id?: string
          ingested_at?: string
          opportunity_id?: string | null
          page_ref?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_by?: string | null
          visibility_tier?: Database["public"]["Enums"]["visibility_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "document_chunks_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          account_id: string | null
          category: Database["public"]["Enums"]["document_category"]
          created_at: string
          created_by: string | null
          drive_file_id: string
          drive_folder_id: string
          id: string
          index_attempts: number
          index_error: string | null
          index_status: Database["public"]["Enums"]["document_index_status"]
          indexed_at: string | null
          link_url: string | null
          mime_type: string
          name: string
          opportunity_id: string | null
          reindex_requested_at: string | null
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          created_by?: string | null
          drive_file_id: string
          drive_folder_id: string
          id?: string
          index_attempts?: number
          index_error?: string | null
          index_status?: Database["public"]["Enums"]["document_index_status"]
          indexed_at?: string | null
          link_url?: string | null
          mime_type: string
          name: string
          opportunity_id?: string | null
          reindex_requested_at?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          account_id?: string | null
          category?: Database["public"]["Enums"]["document_category"]
          created_at?: string
          created_by?: string | null
          drive_file_id?: string
          drive_folder_id?: string
          id?: string
          index_attempts?: number
          index_error?: string | null
          index_status?: Database["public"]["Enums"]["document_index_status"]
          indexed_at?: string | null
          link_url?: string | null
          mime_type?: string
          name?: string
          opportunity_id?: string | null
          reindex_requested_at?: string | null
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_config: {
        Row: {
          accounts_parent_folder_id: string | null
          created_at: string
          docs_access_enabled: boolean
          entity_id: string
          gmail_sync_enabled: boolean
          id: string
          opportunities_parent_folder_id: string | null
          pnl_parent_folder_id: string | null
          sheets_access_enabled: boolean
          slides_access_enabled: boolean
          updated_at: string
        }
        Insert: {
          accounts_parent_folder_id?: string | null
          created_at?: string
          docs_access_enabled?: boolean
          entity_id: string
          gmail_sync_enabled?: boolean
          id?: string
          opportunities_parent_folder_id?: string | null
          pnl_parent_folder_id?: string | null
          sheets_access_enabled?: boolean
          slides_access_enabled?: boolean
          updated_at?: string
        }
        Update: {
          accounts_parent_folder_id?: string | null
          created_at?: string
          docs_access_enabled?: boolean
          entity_id?: string
          gmail_sync_enabled?: boolean
          id?: string
          opportunities_parent_folder_id?: string | null
          pnl_parent_folder_id?: string | null
          sheets_access_enabled?: boolean
          slides_access_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_config_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string
          id: string
          inbound_domain: string | null
          resend_domain: string | null
          status: string
          template_config: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inbound_domain?: string | null
          resend_domain?: string | null
          status?: string
          template_config?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inbound_domain?: string | null
          resend_domain?: string | null
          status?: string
          template_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          active: boolean
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          entity_id: string | null
          id: string
          name: string
          subject: string
          updated_at: string
          updated_by: string | null
          variables: Json
        }
        Insert: {
          active?: boolean
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          id?: string
          name: string
          subject: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Update: {
          active?: boolean
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      email_transport: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          from_address: string | null
          from_name: string | null
          id: string
          provider: string
          resend_api_key: string | null
          resend_domain: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_secure: boolean
          smtp_username: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          from_address?: string | null
          from_name?: string | null
          id?: string
          provider?: string
          resend_api_key?: string | null
          resend_domain?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean
          smtp_username?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          from_address?: string | null
          from_name?: string | null
          id?: string
          provider?: string
          resend_api_key?: string | null
          resend_domain?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_secure?: boolean
          smtp_username?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          active: boolean
          base_currency: string
          comms_tracking_enabled: boolean
          country: string | null
          created_at: string
          created_by: string | null
          custom_data: Json
          display_name: string | null
          email_footer: string | null
          fiscal_year_start_month: number
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          base_currency?: string
          comms_tracking_enabled?: boolean
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          display_name?: string | null
          email_footer?: string | null
          fiscal_year_start_month?: number
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          base_currency?: string
          comms_tracking_enabled?: boolean
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_data?: Json
          display_name?: string | null
          email_footer?: string | null
          fiscal_year_start_month?: number
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      field_definitions: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          data_type: Database["public"]["Enums"]["field_data_type"]
          default_value: Json | null
          display_order: number
          editable_by_roles: string[] | null
          entity_type: Database["public"]["Enums"]["field_entity_type"]
          id: string
          key: string
          label: string
          options: Json | null
          required: boolean
          updated_at: string
          updated_by: string | null
          visible_at_stages: string[] | null
          visible_to_roles: string[] | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          data_type: Database["public"]["Enums"]["field_data_type"]
          default_value?: Json | null
          display_order?: number
          editable_by_roles?: string[] | null
          entity_type: Database["public"]["Enums"]["field_entity_type"]
          id?: string
          key: string
          label: string
          options?: Json | null
          required?: boolean
          updated_at?: string
          updated_by?: string | null
          visible_at_stages?: string[] | null
          visible_to_roles?: string[] | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          data_type?: Database["public"]["Enums"]["field_data_type"]
          default_value?: Json | null
          display_order?: number
          editable_by_roles?: string[] | null
          entity_type?: Database["public"]["Enums"]["field_entity_type"]
          id?: string
          key?: string
          label?: string
          options?: Json | null
          required?: boolean
          updated_at?: string
          updated_by?: string | null
          visible_at_stages?: string[] | null
          visible_to_roles?: string[] | null
        }
        Relationships: []
      }
      finance_export_config: {
        Row: {
          created_at: string
          destination_drive_folder_id: string | null
          enabled: boolean
          entity_id: string
          format: Json
          id: string
          schedule: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_drive_folder_id?: string | null
          enabled?: boolean
          entity_id: string
          format?: Json
          id?: string
          schedule?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_drive_folder_id?: string | null
          enabled?: boolean
          entity_id?: string
          format?: Json
          id?: string
          schedule?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_export_config_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_year_settings: {
        Row: {
          created_at: string
          entity_id: string
          fy_start_month: number
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          fy_start_month: number
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          fy_start_month?: number
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_fiscal_year_settings_entity_id"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          entity_id: string | null
          from_currency: string
          id: string
          rate: number
          source: string
          source_reference: string | null
          to_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          entity_id?: string | null
          from_currency: string
          id?: string
          rate: number
          source: string
          source_reference?: string | null
          to_currency: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          entity_id?: string | null
          from_currency?: string
          id?: string
          rate?: number
          source?: string
          source_reference?: string | null
          to_currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fx_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "fx_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_rates_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fx_rates_from_currency_fkey"
            columns: ["from_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fx_rates_to_currency_fkey"
            columns: ["to_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string
          drive_file_id: string | null
          entity_id: string | null
          error_log: Json | null
          file_url: string | null
          id: string
          kind: string
          record_count: number | null
          status: string
          target_entity_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          drive_file_id?: string | null
          entity_id?: string | null
          error_log?: Json | null
          file_url?: string | null
          id?: string
          kind: string
          record_count?: number | null
          status?: string
          target_entity_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          drive_file_id?: string | null
          entity_id?: string | null
          error_log?: Json | null
          file_url?: string | null
          id?: string
          kind?: string
          record_count?: number | null
          status?: string
          target_entity_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_email_deadletter: {
        Row: {
          alert_sent: boolean
          body: string | null
          created_at: string
          from_address: string
          id: string
          message_id: string | null
          raw_payload: Json
          reason: string
          subject: string | null
          to_address: string
        }
        Insert: {
          alert_sent?: boolean
          body?: string | null
          created_at?: string
          from_address: string
          id?: string
          message_id?: string | null
          raw_payload?: Json
          reason: string
          subject?: string | null
          to_address: string
        }
        Update: {
          alert_sent?: boolean
          body?: string | null
          created_at?: string
          from_address?: string
          id?: string
          message_id?: string | null
          raw_payload?: Json
          reason?: string
          subject?: string | null
          to_address?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      notification_routing: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          created_by: string | null
          enabled: boolean
          entity_id: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          entity_id?: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          entity_id?: string | null
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_routing_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          account_id: string
          amount: number
          barter_value: number | null
          billing_entity_id: string | null
          close_date: string | null
          confidentiality_override_user_ids: string[]
          country_execution: string | null
          created_at: string
          created_by: string | null
          currency: string
          custom_data: Json
          description: string | null
          entity_sales_id: string | null
          estimated_gross_margin_pct: number | null
          execution_date: string | null
          id: string
          legacy_salesforce_id: string | null
          loss_reason: string | null
          name: string
          ops_unit_id: string | null
          owner_user_id: string
          primary_contact_id: string | null
          probability_pct: number
          project_type: Database["public"]["Enums"]["project_type"] | null
          property_type: Database["public"]["Enums"]["property_type"] | null
          recurring: boolean
          recurring_split_kind:
            | Database["public"]["Enums"]["recurring_split_kind"]
            | null
          revenue_category:
            | Database["public"]["Enums"]["revenue_category"]
            | null
          revenue_recognition_unit_id: string | null
          sales_unit_id: string
          service_period_end: string | null
          service_period_start: string | null
          service_type: string[] | null
          stage: Database["public"]["Enums"]["deal_stage"]
          updated_at: string
          updated_by: string | null
          visibility_tier: Database["public"]["Enums"]["visibility_tier"]
        }
        Insert: {
          account_id: string
          amount?: number
          barter_value?: number | null
          billing_entity_id?: string | null
          close_date?: string | null
          confidentiality_override_user_ids?: string[]
          country_execution?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_data?: Json
          description?: string | null
          entity_sales_id?: string | null
          estimated_gross_margin_pct?: number | null
          execution_date?: string | null
          id?: string
          legacy_salesforce_id?: string | null
          loss_reason?: string | null
          name: string
          ops_unit_id?: string | null
          owner_user_id: string
          primary_contact_id?: string | null
          probability_pct?: number
          project_type?: Database["public"]["Enums"]["project_type"] | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          recurring?: boolean
          recurring_split_kind?:
            | Database["public"]["Enums"]["recurring_split_kind"]
            | null
          revenue_category?:
            | Database["public"]["Enums"]["revenue_category"]
            | null
          revenue_recognition_unit_id?: string | null
          sales_unit_id: string
          service_period_end?: string | null
          service_period_start?: string | null
          service_type?: string[] | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          updated_by?: string | null
          visibility_tier?: Database["public"]["Enums"]["visibility_tier"]
        }
        Update: {
          account_id?: string
          amount?: number
          barter_value?: number | null
          billing_entity_id?: string | null
          close_date?: string | null
          confidentiality_override_user_ids?: string[]
          country_execution?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_data?: Json
          description?: string | null
          entity_sales_id?: string | null
          estimated_gross_margin_pct?: number | null
          execution_date?: string | null
          id?: string
          legacy_salesforce_id?: string | null
          loss_reason?: string | null
          name?: string
          ops_unit_id?: string | null
          owner_user_id?: string
          primary_contact_id?: string | null
          probability_pct?: number
          project_type?: Database["public"]["Enums"]["project_type"] | null
          property_type?: Database["public"]["Enums"]["property_type"] | null
          recurring?: boolean
          recurring_split_kind?:
            | Database["public"]["Enums"]["recurring_split_kind"]
            | null
          revenue_category?:
            | Database["public"]["Enums"]["revenue_category"]
            | null
          revenue_recognition_unit_id?: string | null
          sales_unit_id?: string
          service_period_end?: string | null
          service_period_start?: string | null
          service_type?: string[] | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          updated_at?: string
          updated_by?: string | null
          visibility_tier?: Database["public"]["Enums"]["visibility_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_billing_entity_id_fkey"
            columns: ["billing_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_entity_sales_id_fkey"
            columns: ["entity_sales_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_ops_unit_id_fkey"
            columns: ["ops_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "opportunities_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_revenue_recognition_unit_id_fkey"
            columns: ["revenue_recognition_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_sales_unit_id_fkey"
            columns: ["sales_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_revenue_schedule: {
        Row: {
          amount: number
          created_at: string
          id: string
          month: string
          opportunity_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          month: string
          opportunity_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          month?: string
          opportunity_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_revenue_schedule_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_splits: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          opportunity_id: string
          pct: number
          sales_unit_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          opportunity_id: string
          pct: number
          sales_unit_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          opportunity_id?: string
          pct?: number
          sales_unit_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_splits_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_splits_sales_unit_id_fkey"
            columns: ["sales_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "opportunity_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_history: {
        Row: {
          created_at: string
          created_by: string | null
          event: string
          from_stage: Database["public"]["Enums"]["deal_stage"]
          id: string
          opportunity_id: string
          reason: string | null
          to_stage: Database["public"]["Enums"]["deal_stage"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event: string
          from_stage: Database["public"]["Enums"]["deal_stage"]
          id?: string
          opportunity_id: string
          reason?: string | null
          to_stage: Database["public"]["Enums"]["deal_stage"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event?: string
          from_stage?: Database["public"]["Enums"]["deal_stage"]
          id?: string
          opportunity_id?: string
          reason?: string | null
          to_stage?: Database["public"]["Enums"]["deal_stage"]
        }
        Relationships: []
      }
      opportunity_team_members: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          opportunity_id: string
          role: Database["public"]["Enums"]["opportunity_team_role"]
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          opportunity_id: string
          role?: Database["public"]["Enums"]["opportunity_team_role"]
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          opportunity_id?: string
          role?: Database["public"]["Enums"]["opportunity_team_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_team_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "opportunity_team_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_team_members_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "opportunity_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_visibility: {
        Row: {
          created_at: string
          id: string
          opportunity_id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          opportunity_id: string
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          opportunity_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_visibility_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_visibility_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "opportunity_visibility_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      reporting_currency_settings: {
        Row: {
          created_at: string
          currency_code: string
          entity_id: string | null
          id: string
          is_default: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          entity_id?: string | null
          id?: string
          is_default?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          entity_id?: string | null
          id?: string
          is_default?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporting_currency_settings_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "reporting_currency_settings_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_recognition_defaults: {
        Row: {
          created_at: string
          default_split_kind: string
          entity_id: string
          estimated_gross_margin_pct: number | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_split_kind: string
          entity_id: string
          estimated_gross_margin_pct?: number | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_split_kind?: string
          entity_id?: string
          estimated_gross_margin_pct?: number | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_revenue_recognition_defaults_entity_id"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      salesforce_connections: {
        Row: {
          created_at: string
          id: string
          import_status: string
          instance_url: string | null
          last_sync_at: string | null
          oauth_state: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_status?: string
          instance_url?: string | null
          last_sync_at?: string | null
          oauth_state?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          import_status?: string
          instance_url?: string | null
          last_sync_at?: string | null
          oauth_state?: Json
          updated_at?: string
        }
        Relationships: []
      }
      slack_connections: {
        Row: {
          created_at: string
          event_routing: Json
          id: string
          status: string
          updated_at: string
          workspace_id: string
          workspace_name: string | null
        }
        Insert: {
          created_at?: string
          event_routing?: Json
          id?: string
          status?: string
          updated_at?: string
          workspace_id: string
          workspace_name?: string | null
        }
        Update: {
          created_at?: string
          event_routing?: Json
          id?: string
          status?: string
          updated_at?: string
          workspace_id?: string
          workspace_name?: string | null
        }
        Relationships: []
      }
      tax_id_types: {
        Row: {
          active: boolean
          code: string
          country_iso: string
          created_at: string
          created_by: string | null
          display_order: number
          format_regex: string | null
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          country_iso: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          format_regex?: string | null
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          country_iso?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          format_regex?: string | null
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      user_notification_overrides: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          created_by: string | null
          enabled: boolean
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_notification_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string
          created_by: string | null
          entity_id: string | null
          id: string
          link_url: string | null
          message: string
          metadata: Json
          read_at: string | null
          title: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          id?: string
          link_url?: string | null
          message: string
          metadata?: Json
          read_at?: string | null
          title: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          id?: string
          link_url?: string | null
          message?: string
          metadata?: Json
          read_at?: string | null
          title?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          created_by: string | null
          date_format: string
          display_currency: string | null
          entry_currency_default: string | null
          id: string
          job_title: string | null
          number_format: string
          theme: string
          timezone: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_format?: string
          display_currency?: string | null
          entry_currency_default?: string | null
          id?: string
          job_title?: string | null
          number_format?: string
          theme?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_format?: string
          display_currency?: string | null
          entry_currency_default?: string | null
          id?: string
          job_title?: string | null
          number_format?: string
          theme?: string
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_display_currency_fkey"
            columns: ["display_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_preferences_entry_currency_default_fkey"
            columns: ["entry_currency_default"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean
          ai_daily_hard_cap_usd: number | null
          ai_daily_soft_cap_usd: number | null
          created_at: string
          crm_inbound_email: string | null
          custom_data: Json
          email: string
          full_name: string | null
          id: string
          manager_user_id: string | null
          primary_business_unit_id: string | null
          primary_entity_id: string | null
          primary_role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          ai_daily_hard_cap_usd?: number | null
          ai_daily_soft_cap_usd?: number | null
          created_at?: string
          crm_inbound_email?: string | null
          custom_data?: Json
          email: string
          full_name?: string | null
          id: string
          manager_user_id?: string | null
          primary_business_unit_id?: string | null
          primary_entity_id?: string | null
          primary_role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          ai_daily_hard_cap_usd?: number | null
          ai_daily_soft_cap_usd?: number | null
          created_at?: string
          crm_inbound_email?: string | null
          custom_data?: Json
          email?: string
          full_name?: string | null
          id?: string
          manager_user_id?: string | null
          primary_business_unit_id?: string | null
          primary_entity_id?: string | null
          primary_role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_users_primary_business_unit_id"
            columns: ["primary_business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_primary_entity_id"
            columns: ["primary_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "ai_usage_daily_rollup"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "users_manager_user_id_fkey"
            columns: ["manager_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ai_usage_daily_rollup: {
        Row: {
          call_count: number | null
          entity_id: string | null
          team_id: string | null
          total_completion_tokens: number | null
          total_cost_amount: number | null
          total_cost_currency: string | null
          total_prompt_tokens: number | null
          usage_date: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_users_primary_business_unit_id"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_users_primary_entity_id"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_opportunity_schedule: {
        Args: { _opportunity_id: string }
        Returns: boolean
      }
      can_manage_opportunity: {
        Args: { _opportunity_id: string }
        Returns: boolean
      }
      can_read_account: { Args: { _account_id: string }; Returns: boolean }
      can_read_approval_instance: {
        Args: { _instance_id: string }
        Returns: boolean
      }
      can_write_account: { Args: { _account_id: string }; Returns: boolean }
      cancel_approval_instance: {
        Args: { _instance_id: string }
        Returns: undefined
      }
      check_ai_caps: {
        Args: { p_estimated_cost: number; p_user_id: string }
        Returns: {
          blocked: boolean
          cap_limit_amount: number
          cap_limit_currency: string
          cap_type: string
          current_spend_amount: number
          current_spend_currency: string
          reason: string
        }[]
      }
      confidential_opportunities_metadata: {
        Args: never
        Returns: {
          created_at: string
          id: string
          owner_name: string
          owner_user_id: string
          value_bucket: string
        }[]
      }
      current_user_entity_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_effective_user_caps: {
        Args: { p_user_id: string }
        Returns: {
          hard_cap_amount: number
          hard_cap_currency: string
          soft_cap_amount: number
          soft_cap_currency: string
        }[]
      }
      get_todays_company_usage: {
        Args: { p_entity_id: string }
        Returns: {
          call_count: number
          total_cost_amount: number
          total_cost_currency: string
        }[]
      }
      get_todays_team_usage: {
        Args: { p_team_id: string }
        Returns: {
          call_count: number
          total_cost_amount: number
          total_cost_currency: string
        }[]
      }
      get_todays_user_usage: {
        Args: { p_user_id: string }
        Returns: {
          call_count: number
          total_completion_tokens: number
          total_cost_amount: number
          total_cost_currency: string
          total_prompt_tokens: number
        }[]
      }
      is_email_domain_allowed: { Args: { _email: string }; Returns: boolean }
      job_pipeline_health_snapshot: { Args: never; Returns: undefined }
      money_add: {
        Args: {
          a_amount: number
          a_currency: string
          b_amount: number
          b_currency: string
        }
        Returns: Database["public"]["CompositeTypes"]["money_value"]
        SetofOptions: {
          from: "*"
          to: "money_value"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      money_eq: {
        Args: {
          a_amount: number
          a_currency: string
          b_amount: number
          b_currency: string
        }
        Returns: boolean
      }
      opportunity_check_enforce_gate: {
        Args: {
          _opportunity_id: string
          _to_stage: Database["public"]["Enums"]["deal_stage"]
        }
        Returns: boolean
      }
      opportunity_has_approved_approval: {
        Args: { _opportunity_id: string }
        Returns: boolean
      }
      opportunity_is_confidential: {
        Args: { _opp_id: string }
        Returns: boolean
      }
      reassign_approval_step: {
        Args: { _new_user_id: string; _step_id: string }
        Returns: undefined
      }
      recompute_visibility_for_opportunity: {
        Args: { _opportunity_id: string }
        Returns: undefined
      }
      recompute_visibility_for_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
      record_approval_decision: {
        Args: {
          _comment?: string
          _decision: Database["public"]["Enums"]["approval_decision_type"]
          _step_id: string
        }
        Returns: undefined
      }
      replace_account_tax_ids: {
        Args: { _account_id: string; _tax_ids: Json }
        Returns: undefined
      }
      replace_opportunity_splits: {
        Args: { _opportunity_id: string; _rows: Json }
        Returns: undefined
      }
      replace_opportunity_team_members: {
        Args: { _opportunity_id: string; _rows: Json }
        Returns: undefined
      }
      replace_revenue_schedule: {
        Args: { _opportunity_id: string; _rows: Json }
        Returns: undefined
      }
      replace_workflow_steps: {
        Args: { _steps: Json; _workflow_id: string }
        Returns: undefined
      }
      search_document_chunks: {
        Args: {
          _match_count?: number
          _min_similarity?: number
          _model: string
          _query: string
        }
        Returns: {
          account_id: string
          category: Database["public"]["Enums"]["document_category"]
          chunk_index: number
          content: string
          document_id: string
          drive_file_id: string
          id: string
          opportunity_id: string
          page_ref: string
          similarity: number
          visibility_tier: Database["public"]["Enums"]["visibility_tier"]
        }[]
      }
      submit_opportunity_for_approval: {
        Args: { _opportunity_id: string }
        Returns: string
      }
      user_is_step_approver_for_instance: {
        Args: { _instance_id: string; _user_id: string }
        Returns: boolean
      }
      user_triggered_instance_of_step: {
        Args: { _instance_id: string; _user_id: string }
        Returns: boolean
      }
      validate_custom_data: {
        Args: { _entity_type: string; custom_data: Json }
        Returns: boolean
      }
    }
    Enums: {
      account_relationship_kind:
        | "subsidiary_of"
        | "procurement_via"
        | "partner_with"
        | "parent_of"
        | "sister_company"
      ai_call_status:
        | "success"
        | "error"
        | "rate_limited"
        | "cap_rejected"
        | "fallback"
      ai_feature:
        | "search"
        | "summarise_deal"
        | "draft_email"
        | "next_best_action"
        | "other"
      ai_provider:
        | "claude"
        | "gemini"
        | "kimi"
        | "deepseek"
        | "ollama_local"
        | "openai_compatible"
      approval_decision_type: "approved" | "rejected" | "skipped"
      approval_status: "pending" | "approved" | "rejected" | "cancelled"
      approval_step_mode: "any_one" | "all_required"
      approval_step_status: "pending" | "approved" | "rejected" | "skipped"
      business_unit_kind: "sales" | "revenue_recognition" | "ops" | "shared"
      deal_stage:
        | "qualify"
        | "meet_and_present"
        | "propose"
        | "negotiate"
        | "verbal_agreement"
        | "closed_won"
        | "closed_lost"
      document_category:
        | "rfp"
        | "budget"
        | "proposal"
        | "contract"
        | "po"
        | "invoice"
        | "presentation"
        | "other"
      document_index_status: "pending" | "indexed" | "failed"
      field_data_type:
        | "text"
        | "rich_text"
        | "number"
        | "currency"
        | "date"
        | "datetime"
        | "single_select"
        | "multi_select"
        | "user_ref"
        | "account_ref"
        | "boolean"
        | "url"
        | "formula"
      field_entity_type: "account" | "contact" | "opportunity" | "activity"
      notification_channel: "in_app" | "email" | "slack"
      notification_event_type:
        | "stage_change"
        | "deal_assigned"
        | "approval_requested"
        | "mention"
        | "deal_won"
        | "deal_lost"
      opportunity_team_role: "owner" | "contributor" | "viewer" | "approver"
      project_type:
        | "ip"
        | "white_label"
        | "media_rights"
        | "d2c_retail"
        | "d2c_pins"
        | "d2c_touring"
        | "consulting_tech"
        | "consulting_ideas"
        | "talent_management"
        | "pr_services"
        | "other"
      property_type:
        | "conference"
        | "expo"
        | "festival"
        | "food_festival"
        | "scripted_reality_show"
        | "talk_show"
        | "tournament"
        | "consultancy_services"
      recurring_split_kind: "flat" | "custom"
      revenue_category: "live" | "content"
      user_role:
        | "sales_rep"
        | "sales_manager"
        | "regional_head"
        | "group_sales_lead"
        | "finance"
        | "ops"
        | "admin"
        | "exec"
        | "external_partner"
        | "entity_admin"
      visibility_tier: "standard" | "restricted" | "confidential"
    }
    CompositeTypes: {
      money_value: {
        amount: number | null
        currency: string | null
      }
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
    Enums: {
      account_relationship_kind: [
        "subsidiary_of",
        "procurement_via",
        "partner_with",
        "parent_of",
        "sister_company",
      ],
      ai_call_status: [
        "success",
        "error",
        "rate_limited",
        "cap_rejected",
        "fallback",
      ],
      ai_feature: [
        "search",
        "summarise_deal",
        "draft_email",
        "next_best_action",
        "other",
      ],
      ai_provider: [
        "claude",
        "gemini",
        "kimi",
        "deepseek",
        "ollama_local",
        "openai_compatible",
      ],
      approval_decision_type: ["approved", "rejected", "skipped"],
      approval_status: ["pending", "approved", "rejected", "cancelled"],
      approval_step_mode: ["any_one", "all_required"],
      approval_step_status: ["pending", "approved", "rejected", "skipped"],
      business_unit_kind: ["sales", "revenue_recognition", "ops", "shared"],
      deal_stage: [
        "qualify",
        "meet_and_present",
        "propose",
        "negotiate",
        "verbal_agreement",
        "closed_won",
        "closed_lost",
      ],
      document_category: [
        "rfp",
        "budget",
        "proposal",
        "contract",
        "po",
        "invoice",
        "presentation",
        "other",
      ],
      document_index_status: ["pending", "indexed", "failed"],
      field_data_type: [
        "text",
        "rich_text",
        "number",
        "currency",
        "date",
        "datetime",
        "single_select",
        "multi_select",
        "user_ref",
        "account_ref",
        "boolean",
        "url",
        "formula",
      ],
      field_entity_type: ["account", "contact", "opportunity", "activity"],
      notification_channel: ["in_app", "email", "slack"],
      notification_event_type: [
        "stage_change",
        "deal_assigned",
        "approval_requested",
        "mention",
        "deal_won",
        "deal_lost",
      ],
      opportunity_team_role: ["owner", "contributor", "viewer", "approver"],
      project_type: [
        "ip",
        "white_label",
        "media_rights",
        "d2c_retail",
        "d2c_pins",
        "d2c_touring",
        "consulting_tech",
        "consulting_ideas",
        "talent_management",
        "pr_services",
        "other",
      ],
      property_type: [
        "conference",
        "expo",
        "festival",
        "food_festival",
        "scripted_reality_show",
        "talk_show",
        "tournament",
        "consultancy_services",
      ],
      recurring_split_kind: ["flat", "custom"],
      revenue_category: ["live", "content"],
      user_role: [
        "sales_rep",
        "sales_manager",
        "regional_head",
        "group_sales_lead",
        "finance",
        "ops",
        "admin",
        "exec",
        "external_partner",
        "entity_admin",
      ],
      visibility_tier: ["standard", "restricted", "confidential"],
    },
  },
} as const

