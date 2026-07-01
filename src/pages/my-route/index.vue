<script setup>
import RouteDetails from '@/views/apps/logistics/routes/RouteDetails.vue'
import { ref } from 'vue'

definePage({
  meta: {
    action: 'read',
    subject: 'Auth', // or something appropriate
    navActiveLink: 'my-route',
  },
})

// Current date in YYYY-MM-DD
const today = new Date().toISOString().split('T')[0]
const selectedDate = ref(today)

</script>

<template>
  <div>
    <div class="d-flex align-center justify-space-between mb-4">
      <h3 class="text-h3">My Route</h3>
      
      <!-- Allow the rep to pick a date -->
      <VTextField
        v-model="selectedDate"
        type="date"
        label="Select Date"
        density="compact"
        style="max-width: 200px"
      />
    </div>

    <RouteDetails
      :route-id="0" 
      :is-my-route="true"
      :route-date="selectedDate"
    />
  </div>
</template>
