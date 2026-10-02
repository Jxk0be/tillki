export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string
          function_name: string
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          function_name: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          function_name?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'ai_usage_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      allowed_emails: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          role: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          role?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          role?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          tool_calls: Json | null
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'chat_messages_thread_id_fkey'
            columns: ['thread_id']
            isOneToOne: false
            referencedRelation: 'chat_threads'
            referencedColumns: ['id']
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'chat_threads_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          category: Database['public']['Enums']['expense_category']
          created_at: string
          created_by: string | null
          id: string
          incurred_at: string
          note: string | null
          receipt_path: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount_cents: number
          category: Database['public']['Enums']['expense_category']
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_at?: string
          note?: string | null
          receipt_path?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount_cents?: number
          category?: Database['public']['Enums']['expense_category']
          created_at?: string
          created_by?: string | null
          id?: string
          incurred_at?: string
          note?: string | null
          receipt_path?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      inventory_snapshots: {
        Row: {
          cost_basis_cents: number
          created_at: string
          items_in_stock: number
          list_value_cents: number
          snapshot_date: string
          units_in_stock: number
        }
        Insert: {
          cost_basis_cents?: number
          created_at?: string
          items_in_stock?: number
          list_value_cents?: number
          snapshot_date: string
          units_in_stock?: number
        }
        Update: {
          cost_basis_cents?: number
          created_at?: string
          items_in_stock?: number
          list_value_cents?: number
          snapshot_date?: string
          units_in_stock?: number
        }
        Relationships: []
      }
      item_acquisitions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          lot_id: string | null
          purchase_source: string | null
          purchased_at: string
          quantity: number
          unit_cost_cents: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          lot_id?: string | null
          purchase_source?: string | null
          purchased_at?: string
          quantity: number
          unit_cost_cents: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          lot_id?: string | null
          purchase_source?: string | null
          purchased_at?: string
          quantity?: number
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: 'item_acquisitions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'item_acquisitions_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'item_acquisitions_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'v_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'item_acquisitions_lot_id_fkey'
            columns: ['lot_id']
            isOneToOne: false
            referencedRelation: 'lots'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'item_acquisitions_lot_id_fkey'
            columns: ['lot_id']
            isOneToOne: false
            referencedRelation: 'v_lots'
            referencedColumns: ['id']
          },
        ]
      }
      item_events: {
        Row: {
          actor: string | null
          created_at: string
          event_type: string
          id: string
          item_id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          event_type: string
          id?: string
          item_id: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          event_type?: string
          id?: string
          item_id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: 'item_events_actor_fkey'
            columns: ['actor']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'item_events_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'item_events_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'v_items'
            referencedColumns: ['id']
          },
        ]
      }
      item_images: {
        Row: {
          created_at: string
          id: string
          item_id: string
          position: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          position: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: 'item_images_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'item_images_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'v_items'
            referencedColumns: ['id']
          },
        ]
      }
      item_templates: {
        Row: {
          archived_at: string | null
          category: Database['public']['Enums']['item_category']
          created_at: string
          created_by: string | null
          default_condition: Database['public']['Enums']['item_condition'] | null
          default_cost_cents: number | null
          default_list_price_cents: number | null
          description: string | null
          id: string
          is_ongoing: boolean
          language: string | null
          name: string
          notes: string | null
          publisher: string | null
          tags: string[]
          title_pattern: string
          total_volumes: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          category?: Database['public']['Enums']['item_category']
          created_at?: string
          created_by?: string | null
          default_condition?: Database['public']['Enums']['item_condition'] | null
          default_cost_cents?: number | null
          default_list_price_cents?: number | null
          description?: string | null
          id?: string
          is_ongoing?: boolean
          language?: string | null
          name: string
          notes?: string | null
          publisher?: string | null
          tags?: string[]
          title_pattern?: string
          total_volumes?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          category?: Database['public']['Enums']['item_category']
          created_at?: string
          created_by?: string | null
          default_condition?: Database['public']['Enums']['item_condition'] | null
          default_cost_cents?: number | null
          default_list_price_cents?: number | null
          description?: string | null
          id?: string
          is_ongoing?: boolean
          language?: string | null
          name?: string
          notes?: string | null
          publisher?: string | null
          tags?: string[]
          title_pattern?: string
          total_volumes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'item_templates_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      items: {
        Row: {
          archived_at: string | null
          category: Database['public']['Enums']['item_category']
          condition: Database['public']['Enums']['item_condition'] | null
          cost_cents: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          isbn: string | null
          list_price_cents: number | null
          listed_at: string | null
          name: string
          name_is_custom: boolean
          purchased_at: string | null
          quantity: number
          series: string | null
          sku: string | null
          status: Database['public']['Enums']['item_status']
          storage_location: string | null
          tags: string[]
          template_id: string | null
          updated_at: string
          volume_number: number | null
        }
        Insert: {
          archived_at?: string | null
          category: Database['public']['Enums']['item_category']
          condition?: Database['public']['Enums']['item_condition'] | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          isbn?: string | null
          list_price_cents?: number | null
          listed_at?: string | null
          name: string
          name_is_custom?: boolean
          purchased_at?: string | null
          quantity?: number
          series?: string | null
          sku?: string | null
          status?: Database['public']['Enums']['item_status']
          storage_location?: string | null
          tags?: string[]
          template_id?: string | null
          updated_at?: string
          volume_number?: number | null
        }
        Update: {
          archived_at?: string | null
          category?: Database['public']['Enums']['item_category']
          condition?: Database['public']['Enums']['item_condition'] | null
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          isbn?: string | null
          list_price_cents?: number | null
          listed_at?: string | null
          name?: string
          name_is_custom?: boolean
          purchased_at?: string | null
          quantity?: number
          series?: string | null
          sku?: string | null
          status?: Database['public']['Enums']['item_status']
          storage_location?: string | null
          tags?: string[]
          template_id?: string | null
          updated_at?: string
          volume_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'items_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'item_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'v_templates'
            referencedColumns: ['id']
          },
        ]
      }
      lots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          purchased_at: string | null
          source: string | null
          total_cost_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          purchased_at?: string | null
          source?: string | null
          total_cost_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          purchased_at?: string | null
          source?: string | null
          total_cost_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'lots_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          bundle_id: string | null
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          notes: string | null
          other_cost_cents: number
          platform: Database['public']['Enums']['sales_platform']
          platform_fee_cents: number
          quantity: number
          sale_price_cents: number
          shipping_charged_cents: number
          shipping_cost_cents: number
          sold_at: string
          updated_at: string
        }
        Insert: {
          bundle_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          other_cost_cents?: number
          platform: Database['public']['Enums']['sales_platform']
          platform_fee_cents?: number
          quantity?: number
          sale_price_cents: number
          shipping_charged_cents?: number
          shipping_cost_cents?: number
          sold_at?: string
          updated_at?: string
        }
        Update: {
          bundle_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          other_cost_cents?: number
          platform?: Database['public']['Enums']['sales_platform']
          platform_fee_cents?: number
          quantity?: number
          sale_price_cents?: number
          shipping_charged_cents?: number
          shipping_cost_cents?: number
          sold_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sales_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'v_items'
            referencedColumns: ['id']
          },
        ]
      }
      template_images: {
        Row: {
          created_at: string
          id: string
          position: number
          storage_path: string
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          storage_path: string
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          storage_path?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'template_images_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'item_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'template_images_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'v_templates'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_items: {
        Row: {
          acquisition_count: number | null
          archived_at: string | null
          category: Database['public']['Enums']['item_category'] | null
          condition: Database['public']['Enums']['item_condition'] | null
          cost_cents: number | null
          cover_path: string | null
          cover_source: string | null
          created_at: string | null
          created_by: string | null
          days_in_stock: number | null
          description: string | null
          effective_description: string | null
          est_profit_cents: number | null
          id: string | null
          image_count: number | null
          isbn: string | null
          kind: string | null
          list_price_cents: number | null
          listed_at: string | null
          lot_names: string[] | null
          name: string | null
          name_is_custom: boolean | null
          purchased_at: string | null
          quantity: number | null
          series: string | null
          sku: string | null
          status: Database['public']['Enums']['item_status'] | null
          storage_location: string | null
          tags: string[] | null
          template_id: string | null
          template_name: string | null
          total_volumes: number | null
          units_left: number | null
          units_sold: number | null
          updated_at: string | null
          volume_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'items_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'item_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'v_templates'
            referencedColumns: ['id']
          },
        ]
      }
      v_lots: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string | null
          item_count: number | null
          name: string | null
          net_revenue_cents: number | null
          notes: string | null
          paid_back_percent: number | null
          purchased_at: string | null
          source: string | null
          total_cost_cents: number | null
          units_bought: number | null
          units_sold: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'lots_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      v_sales: {
        Row: {
          bundle_id: string | null
          category: Database['public']['Enums']['item_category'] | null
          created_at: string | null
          created_by: string | null
          id: string | null
          item_id: string | null
          item_name: string | null
          net_profit_cents: number | null
          notes: string | null
          other_cost_cents: number | null
          platform: Database['public']['Enums']['sales_platform'] | null
          platform_fee_cents: number | null
          quantity: number | null
          sale_price_cents: number | null
          series: string | null
          shipping_charged_cents: number | null
          shipping_cost_cents: number | null
          sold_at: string | null
          template_id: string | null
          template_name: string | null
          unit_cost_cents: number | null
          updated_at: string | null
          volume_number: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'item_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'items_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'v_templates'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sales_item_id_fkey'
            columns: ['item_id']
            isOneToOne: false
            referencedRelation: 'v_items'
            referencedColumns: ['id']
          },
        ]
      }
      v_templates: {
        Row: {
          archived_at: string | null
          category: Database['public']['Enums']['item_category'] | null
          completion_percent: number | null
          cost_basis_cents: number | null
          cover_path: string | null
          created_at: string | null
          created_by: string | null
          default_condition: Database['public']['Enums']['item_condition'] | null
          default_cost_cents: number | null
          default_list_price_cents: number | null
          description: string | null
          est_profit_cents: number | null
          extra_copies: number | null
          id: string | null
          is_ongoing: boolean | null
          language: string | null
          last_added_at: string | null
          list_value_cents: number | null
          missing_count: number | null
          missing_ranges: string | null
          name: string | null
          notes: string | null
          owned_ranges: string | null
          publisher: string | null
          tags: string[] | null
          title_pattern: string | null
          total_known: boolean | null
          total_volumes: number | null
          units_in_stock: number | null
          updated_at: string | null
          volumes_owned: number | null
          volumes_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'item_templates_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      add_copies: {
        Args: {
          p_item_id: string
          p_lot_id?: string
          p_purchase_source?: string
          p_purchased_at?: string
          p_quantity: number
          p_unit_cost_cents: number
        }
        Returns: {
          archived_at: string | null
          category: Database['public']['Enums']['item_category']
          condition: Database['public']['Enums']['item_condition'] | null
          cost_cents: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          isbn: string | null
          list_price_cents: number | null
          listed_at: string | null
          name: string
          name_is_custom: boolean
          purchased_at: string | null
          quantity: number
          series: string | null
          sku: string | null
          status: Database['public']['Enums']['item_status']
          storage_location: string | null
          tags: string[]
          template_id: string | null
          updated_at: string
          volume_number: number | null
        }
        SetofOptions: {
          from: '*'
          to: 'items'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_template_volumes: {
        Args: {
          p_condition?: Database['public']['Enums']['item_condition']
          p_cost_cents?: number
          p_cost_mode?: string
          p_list_price_cents?: number
          p_lot_id?: string
          p_overrides?: Json
          p_purchase_source?: string
          p_purchased_at?: string
          p_status?: Database['public']['Enums']['item_status']
          p_storage_location?: string
          p_template_id: string
          p_volumes: number[]
        }
        Returns: {
          action: string
          item_id: string
          new_quantity: number
          volume_number: number
        }[]
      }
      allocate_lot_cost: {
        Args: { p_dry_run?: boolean; p_lot_id: string; p_mode?: string }
        Returns: {
          item_id: string
          item_name: string
          quantity: number
          total_cents: number
          unit_cost_cents: number
        }[]
      }
      create_item: {
        Args: { p_acquisition?: Json; p_item: Json }
        Returns: {
          archived_at: string | null
          category: Database['public']['Enums']['item_category']
          condition: Database['public']['Enums']['item_condition'] | null
          cost_cents: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          isbn: string | null
          list_price_cents: number | null
          listed_at: string | null
          name: string
          name_is_custom: boolean
          purchased_at: string | null
          quantity: number
          series: string | null
          sku: string | null
          status: Database['public']['Enums']['item_status']
          storage_location: string | null
          tags: string[]
          template_id: string | null
          updated_at: string
          volume_number: number | null
        }
        SetofOptions: {
          from: '*'
          to: 'items'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      default_fee_percent: { Args: never; Returns: number }
      format_volume_ranges: { Args: { p_volumes: number[] }; Returns: string }
      hook_before_user_created: { Args: { event: Json }; Returns: Json }
      insert_acquisition_total: {
        Args: {
          p_item_id: string
          p_lot_id: string
          p_purchase_source: string
          p_purchased_at: string
          p_quantity: number
          p_total_cents: number
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      record_bundle_sale: {
        Args: {
          p_alloc_mode?: string
          p_items: Json
          p_notes?: string
          p_platform: Database['public']['Enums']['sales_platform']
          p_platform_fee_cents?: number
          p_shipping_charged_cents?: number
          p_shipping_cost_cents?: number
          p_sold_at?: string
          p_total_price_cents: number
        }
        Returns: string
      }
      render_volume_title: {
        Args: { p_name: string; p_pattern: string; p_volume: number }
        Returns: string
      }
      search_templates: {
        Args: { q: string }
        Returns: {
          category: Database['public']['Enums']['item_category']
          id: string
          name: string
          score: number
          total_volumes: number
        }[]
      }
      split_cents: {
        Args: { p_total: number; p_weights: number[] }
        Returns: number[]
      }
      sync_item_from_acquisitions: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      sync_item_sale_status: { Args: { p_item_id: string }; Returns: undefined }
      take_inventory_snapshot: { Args: never; Returns: undefined }
      template_volume_status: {
        Args: { p_template_id: string }
        Returns: {
          quantity: number
          state: string
          status: Database['public']['Enums']['item_status']
          units_left: number
          volume_number: number
        }[]
      }
    }
    Enums: {
      expense_category:
        'supplies' | 'shipping' | 'platform_fees' | 'event_fees' | 'travel' | 'software' | 'other'
      item_category: 'manga' | 'figure' | 'merch' | 'custom' | 'other'
      item_condition: 'new' | 'like_new' | 'very_good' | 'good' | 'acceptable' | 'for_parts'
      item_status: 'draft' | 'in_stock' | 'listed' | 'reserved' | 'sold' | 'kept' | 'written_off'
      sales_platform:
        'ebay' | 'mercari' | 'fb_marketplace' | 'shopify' | 'event' | 'in_person' | 'other'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      expense_category: [
        'supplies',
        'shipping',
        'platform_fees',
        'event_fees',
        'travel',
        'software',
        'other',
      ],
      item_category: ['manga', 'figure', 'merch', 'custom', 'other'],
      item_condition: ['new', 'like_new', 'very_good', 'good', 'acceptable', 'for_parts'],
      item_status: ['draft', 'in_stock', 'listed', 'reserved', 'sold', 'kept', 'written_off'],
      sales_platform: [
        'ebay',
        'mercari',
        'fb_marketplace',
        'shopify',
        'event',
        'in_person',
        'other',
      ],
    },
  },
} as const
