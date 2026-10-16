// let mode = "known";
// let selectedInterests = new Set();
// let latestTrip = null;
// let selectedFlight = null;
// let selectedHotel = null;
// let selectedCab = null;
// let tripController = null;

// const $ = id => document.getElementById(id);
// const esc = x => String(x ?? "Information unavailable").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

// // Mode selection
// document.querySelectorAll(".mode-card").forEach(button => {
//   button.onclick = () => {
//     mode = button.dataset.mode;
//     document.querySelectorAll(".mode-card").forEach(x => x.classList.toggle("active", x === button));
//     if (mode === "discover") {
//       window.location.href = "/discover";
//       return;
//     }
//     document.querySelector(".destination-field").classList.remove("hidden");
//     $("destination").required = true;
//   };
// });

// // Interests tag buttons
// $("interests")?.addEventListener("click", event => {
//   if (event.target.tagName !== "BUTTON") return;
//   const tag = event.target.textContent.trim();
//   if (selectedInterests.has(tag)) {
//     selectedInterests.delete(tag);
//     event.target.classList.remove("selected");
//   } else {
//     selectedInterests.add(tag);
//     event.target.classList.add("selected");
//   }
// });

// function section(title, body, badge = "") {
//   return `
//     <section class="dash-section">
//       <div class="dash-section-header">
//         <h3>${esc(title)}</h3>
//         ${badge ? `<span class="section-tag">${esc(badge)}</span>` : ""}
//       </div>
//       ${body}
//     </section>
//   `;
// }

// function parseCurrencyNum(val) {
//   if (!val) return 0;
//   const clean = String(val).replace(/[^0-9.]/g, "");
//   return Number(clean) || 0;
// }

// function buildTripViewModel(payload, response) {
//   const dest = payload.destination || (payload.selected_destinations?.join(", ")) || "Selected Destination";
  
//   const itinerary = (response.itinerary || []).map(activity => ({
//     date: activity.date || payload.start_date || "Day 1",
//     start_time: activity.start_time || "09:00",
//     end_time: activity.end_time || "11:30",
//     title: activity.title || "Sightseeing & Exploration",
//     location: activity.location || dest,
//     description: activity.description || "",
//     reason: activity.reason || "",
//     status: activity.cost_status === "UNAVAILABLE" ? "ESTIMATED" : (activity.cost_status || "VERIFIED"),
//     cost: activity.estimated_cost ? Number(activity.estimated_cost) : null,
//     cost_text: activity.estimated_cost ? `₹${Number(activity.estimated_cost).toLocaleString("en-IN")}` : "Free / Included",
//     is_custom: false
//   }));

//   const fallbackFlights = [
//     {
//       airline: "IndiGo / Air India",
//       flight_number: "6E-241 / AI-582",
//       departure: "08:30",
//       arrival: "11:45",
//       stops: "Non-stop (3h 15m)",
//       price: "₹6,800",
//       price_num: 6800,
//       cabin: "7kg Cabin + 15kg Check-in",
//       status: "ESTIMATED"
//     },
//     {
//       airline: "Vistara",
//       flight_number: "UK-819",
//       departure: "14:15",
//       arrival: "17:30",
//       stops: "Non-stop (3h 15m)",
//       price: "₹8,200",
//       price_num: 8200,
//       cabin: "Premium Economy · Meal Included",
//       status: "ESTIMATED"
//     }
//   ];

//   const fallbackCabs = [
//     {
//       name: "Airport / Station Transfer",
//       route: "Terminal ⇄ Hotel Check-in",
//       duration: "35–45 mins",
//       price: "₹950",
//       price_num: 950,
//       vehicle: "Sedan (AC) with luggage space",
//       status: "ESTIMATED"
//     },
//     {
//       name: "Full-Day Sightseeing Chauffeur",
//       route: "All prime attractions & viewpoint loop",
//       duration: "8 hours / 80 km",
//       price: "₹2,400",
//       price_num: 2400,
//       vehicle: "Dedicated SUV / Sedan with local guide-driver",
//       status: "ESTIMATED"
//     }
//   ];

//   const fallbackInsights = {
//     destination: dest,
//     photo_spots: [
//       `Sunrise lookout overlooking ${dest} hills for panoramic morning mist (06:00–07:30 AM).`,
//       "Waterfront / Lake promenade during golden hour for reflection shots.",
//       "Traditional spice gardens and heritage market arches for vibrant culture photos."
//     ],
//     culinary_tips: [
//       "Sample authentic regional breakfast (e.g. fresh Appam with Stew or local Thali) at heritage diners.",
//       "Visit verified plantation cafes for freshly brewed cardamom & cinnamon tea.",
//       "Avoid tourist traps on highway bypasses; seek spots favored by local families."
//     ],
//     transit_hacks: [
//       "Book authorized boats / prepaid taxis in advance to avoid middleman commission at terminals.",
//       "Keep small cash notes (₹100/₹200) for entry passes and regional parking.",
//       "Start morning transfers before 09:00 AM to beat tourist buses on winding roads."
//     ],
//     packing_and_safety: [
//       "Sturdy footwear with traction for damp pathways and nature trails.",
//       "Light rain jacket / compact umbrella and insect repellent.",
//       "Respect local dress codes by keeping shoulders and knees covered in cultural sanctuaries."
//     ],
//     creator_insights: [
//       "Top creators recommend the early 07:30 AM boat safari for best wildlife sightings.",
//       "Opt for eco-resorts or plantation stays rather than standard transit hotels.",
//       "Allow at least 2.5 hours for guided spice plantation walks to experience organic harvesting."
//     ]
//   };

//   return {
//     ...response,
//     request: payload,
//     selected_destination: dest,
//     flights: (response.flights && response.flights.length > 0 && !response.flights[0].message) ? response.flights.map((f, i) => ({
//       ...f,
//       price_num: parseCurrencyNum(f.price || f.estimated_cost) || (6500 + i * 1200)
//     })) : fallbackFlights,
//     hotels: (response.hotels && response.hotels.length > 0) ? response.hotels.map((h, i) => ({
//       ...h,
//       total_num: parseCurrencyNum(h.total_price || h.price_num || h.price) || (12000 + i * 3500)
//     })) : [],
//     cabs: fallbackCabs,
//     travel_insights: response.travel_insights || fallbackInsights,
//     itinerary_items: itinerary.length ? itinerary : [
//       { date: payload.start_date, start_time: "14:00", end_time: "16:00", title: `Arrival & Check-in in ${dest}`, location: dest, description: "Arrive from starting city, settle in accommodation, and relax.", status: "VERIFIED", cost: null, cost_text: "Included" },
//       { date: payload.start_date, start_time: "18:00", end_time: "20:30", title: "Evening Scenic Walk & Local Dinner", location: dest, description: "Explore the waterfront/promenade and sample local cuisine.", status: "ESTIMATED", cost: 800, cost_text: "₹800" },
//       { date: payload.end_date, start_time: "09:30", end_time: "12:30", title: `Key Highlights & Heritage of ${dest}`, location: dest, description: "Guided tour through iconic cultural and natural spots.", status: "VERIFIED", cost: 500, cost_text: "₹500" },
//       { date: payload.end_date, start_time: "15:00", end_time: "17:00", title: "Return Transfer & Departure", location: dest, description: "Transfer to airport/station for departure.", status: "VERIFIED", cost: null, cost_text: "Transfer" }
//     ]
//   };
// }

// // -------------------------------------------------------------
// // DYNAMIC SELECTION HANDLERS: ADD FLIGHT / HOTEL / CAB TO ITINERARY
// // -------------------------------------------------------------

// function toggleFlightSelection(index) {
//   if (!latestTrip) return;
//   const flight = latestTrip.flights[index];
  
//   if (selectedFlight && selectedFlight.flight_number === flight.flight_number) {
//     selectedFlight = null;
//     latestTrip.itinerary_items = latestTrip.itinerary_items.filter(act => !act.is_flight_entry);
//     showToast("Flight removed from itinerary.");
//   } else {
//     selectedFlight = flight;
//     latestTrip.itinerary_items = latestTrip.itinerary_items.filter(act => !act.is_flight_entry);
    
//     const depDate = latestTrip.request.start_date;
//     latestTrip.itinerary_items.unshift({
//       date: depDate,
//       start_time: flight.departure || "08:30",
//       end_time: flight.arrival || "11:45",
//       title: `✈️ Confirmed Flight: ${flight.airline} (${flight.flight_number || "Direct"})`,
//       location: `${latestTrip.request.origin} → ${latestTrip.selected_destination}`,
//       description: `Confirmed transit flight. Baggage: ${flight.cabin || "Standard allowance"}.`,
//       reason: "Confirmed Travel Booking",
//       status: "VERIFIED",
//       cost: flight.price_num || parseCurrencyNum(flight.price),
//       cost_text: flight.price || `₹${flight.price_num}`,
//       is_flight_entry: true
//     });
    
//     showToast(`✓ ${flight.airline} added to your Day 1 itinerary!`);
//   }
  
//   renderTrip(latestTrip);
// }

// function toggleHotelSelection(index) {
//   if (!latestTrip) return;
//   const hotel = latestTrip.hotels[index];
  
//   if (selectedHotel && selectedHotel.name === hotel.name) {
//     selectedHotel = null;
//     latestTrip.itinerary_items = latestTrip.itinerary_items.filter(act => !act.is_hotel_entry);
//     showToast("Hotel removed from itinerary.");
//   } else {
//     selectedHotel = hotel;
//     latestTrip.itinerary_items = latestTrip.itinerary_items.filter(act => !act.is_hotel_entry);
    
//     const checkinDate = latestTrip.request.start_date;
//     const insertIdx = Math.min(1, latestTrip.itinerary_items.length);
//     latestTrip.itinerary_items.splice(insertIdx, 0, {
//       date: checkinDate,
//       start_time: "14:00",
//       end_time: "15:00",
//       title: `🏨 Confirmed Stay: Check-in at ${hotel.name}`,
//       location: hotel.area || latestTrip.selected_destination,
//       description: `Confirmed accommodation. ${hotel.amenities || "Breakfast & WiFi included"}. Rating: ${hotel.rating || "4.7 ★"}`,
//       reason: "Accommodation Check-in",
//       status: "VERIFIED",
//       cost: hotel.total_num || parseCurrencyNum(hotel.total_price),
//       cost_text: hotel.total_price || hotel.nightly_price,
//       is_hotel_entry: true
//     });
    
//     showToast(`✓ ${hotel.name} confirmed in your itinerary & budget!`);
//   }
  
//   renderTrip(latestTrip);
// }

// function toggleCabSelection(index) {
//   if (!latestTrip) return;
//   const cab = latestTrip.cabs[index];
  
//   if (selectedCab && selectedCab.name === cab.name) {
//     selectedCab = null;
//     latestTrip.itinerary_items = latestTrip.itinerary_items.filter(act => !act.is_cab_entry);
//     showToast("Cab transfer removed from itinerary.");
//   } else {
//     selectedCab = cab;
//     latestTrip.itinerary_items = latestTrip.itinerary_items.filter(act => !act.is_cab_entry);
    
//     const cabDate = latestTrip.request.start_date;
//     latestTrip.itinerary_items.splice(1, 0, {
//       date: cabDate,
//       start_time: "12:00",
//       end_time: "13:00",
//       title: `🚗 Dedicated Transfer: ${cab.name}`,
//       location: cab.route || latestTrip.selected_destination,
//       description: `${cab.vehicle || "AC Sedan"}. Duration: ${cab.duration}`,
//       reason: "Local Transport Booking",
//       status: "VERIFIED",
//       cost: cab.price_num || parseCurrencyNum(cab.price),
//       cost_text: cab.price || `₹${cab.price_num}`,
//       is_cab_entry: true
//     });
    
//     showToast(`✓ ${cab.name} added to your schedule!`);
//   }
  
//   renderTrip(latestTrip);
// }

// function showToast(msg) {
//   let toast = $("tripmateToast");
//   if (!toast) {
//     toast = document.createElement("div");
//     toast.id = "tripmateToast";
//     toast.className = "app-toast";
//     document.body.appendChild(toast);
//   }
//   toast.textContent = msg;
//   toast.classList.add("visible");
//   setTimeout(() => toast.classList.remove("visible"), 3200);
// }

// // -------------------------------------------------------------
// // RENDER METHODS
// // -------------------------------------------------------------

// function renderItinerary(items) {
//   if (!items || !items.length) {
//     return `<div class="empty-notice">No itinerary generated yet.</div>`;
//   }

//   const groups = {};
//   items.forEach(item => {
//     const d = item.date || "Day 1";
//     if (!groups[d]) groups[d] = [];
//     groups[d].push(item);
//   });

//   return `
//     <div class="itinerary-timeline">
//       ${Object.entries(groups).map(([dateKey, acts], dayIdx) => `
//         <div class="itinerary-day-block">
//           <div class="day-badge-header">
//             <span class="day-number">Day ${dayIdx + 1}</span>
//             <span class="day-date">${esc(dateKey)}</span>
//           </div>
//           <div class="day-activities">
//             ${acts.map(act => `
//               <article class="activity-card ${act.is_flight_entry ? 'flight-activity' : ''} ${act.is_hotel_entry ? 'hotel-activity' : ''} ${act.is_cab_entry ? 'cab-activity' : ''}">
//                 <div class="activity-time-col">
//                   <span class="activity-time">${esc(act.start_time)}</span>
//                   ${act.end_time && act.end_time !== "Flexible" ? `<span class="activity-endtime">to ${esc(act.end_time)}</span>` : ""}
//                 </div>
//                 <div class="activity-main-col">
//                   <div class="activity-title-row">
//                     <h4>${esc(act.title)}</h4>
//                     <span class="status-badge ${act.status === 'VERIFIED' ? 'VERIFIED' : 'ESTIMATED'}">${esc(act.status)}</span>
//                   </div>
//                   <div class="activity-location">📍 ${esc(act.location)}</div>
//                   <p class="activity-desc">${esc(act.description)}</p>
//                   <div class="activity-footer">
//                     ${act.cost_text ? `<span class="cost-pill">💰 ${esc(act.cost_text)}</span>` : '<span class="cost-pill free">Included / Free</span>'}
//                     ${act.reason ? `<span class="reason-tag">💡 ${esc(act.reason)}</span>` : ''}
//                   </div>
//                 </div>
//               </article>
//             `).join("")}
//           </div>
//         </div>
//       `).join("")}
//     </div>
//   `;
// }

// function renderFlightCards(flights) {
//   return `
//     <div class="cards">
//       ${(flights || []).map((f, i) => {
//         const isChosen = selectedFlight && selectedFlight.flight_number === f.flight_number;
//         return `
//           <article class="data-card provider-card ${isChosen ? 'is-selected-card' : ''}">
//             <div class="card-header-row">
//               <div>
//                 <h4>✈️ ${esc(f.airline)}</h4>
//                 <span class="sub-code">${esc(f.flight_number || "Scheduled Flight")}</span>
//               </div>
//               <span class="status-badge ${f.status || 'ESTIMATED'}">${esc(f.status || 'ESTIMATED')}</span>
//             </div>
//             <div class="flight-timings-grid">
//               <div class="timing-block">
//                 <strong class="time">${esc(f.departure || "08:30")}</strong>
//                 <small>${esc(latestTrip?.request?.origin || "Origin")}</small>
//               </div>
//               <div class="flight-path">
//                 <span>${esc(f.stops || "Direct")}</span>
//                 <div class="path-line"></div>
//               </div>
//               <div class="timing-block">
//                 <strong class="time">${esc(f.arrival || "11:45")}</strong>
//                 <small>${esc(latestTrip?.selected_destination || "Destination")}</small>
//               </div>
//             </div>
//             ${f.cabin ? `<div class="card-section"><span class="travel-text">🧳 ${esc(f.cabin)}</span></div>` : ""}
//             <div class="card-action-row provider-action-row">
//               <div class="price-block">
//                 <span class="price-val">${esc(f.price || `₹${f.price_num}`)}</span>
//                 <small>/ person</small>
//               </div>
//               <button class="primary ${isChosen ? 'added-btn' : ''}" type="button" onclick="toggleFlightSelection(${i})">
//                 ${isChosen ? '✓ In Itinerary' : '+ Add to Itinerary'}
//               </button>
//             </div>
//           </article>
//         `;
//       }).join("")}
//     </div>
//   `;
// }

// function renderHotelCards(hotels) {
//   if (!hotels || !hotels.length) {
//     return `<div class="empty-notice">No hotels found. Use the Replanning Assistant below to search hotels near any landmark.</div>`;
//   }
//   return `
//     <div class="cards" id="hotelsGridContainer">
//       ${(hotels || []).map((h, i) => {
//         const isChosen = selectedHotel && selectedHotel.name === h.name;
//         const bookingLink = h.booking_url || `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(h.name + ' ' + (latestTrip?.selected_destination || ''))}`;
//         return `
//           <article class="data-card provider-card clean-hotel-card ${isChosen ? 'is-selected-card' : ''}">
//             <div class="card-header-row">
//               <div>
//                 <h4>🏨 ${esc(h.name)}</h4>
//                 <span class="sub-code">📍 ${esc(h.area || latestTrip?.selected_destination || "Prime Location")}</span>
//               </div>
//               <span class="rating-badge">${esc(h.rating || "4.7 ★")}</span>
//             </div>
//             <div class="card-section">
//               <span class="card-label">Verified Amenities:</span>
//               <p class="card-text">${esc(h.amenities || "Free Breakfast · Wi-Fi · AC · Daily Housekeeping")}</p>
//             </div>
//             <div class="card-action-row provider-action-row">
//               <div class="price-block">
//                 <span class="price-val">${esc(h.total_price || h.nightly_price || "₹13,500")}</span>
//                 <small>${h.nightly_price ? `(${esc(h.nightly_price)})` : 'total stay'}</small>
//               </div>
//               <div class="hotel-btns-group">
//                 <a href="${esc(bookingLink)}" target="_blank" rel="noreferrer" class="hotel-view-link">
//                   Book / View ↗
//                 </a>
//                 <button class="primary ${isChosen ? 'added-btn' : ''}" type="button" onclick="toggleHotelSelection(${i})">
//                   ${isChosen ? '✓ In Itinerary' : '+ Add to Itinerary'}
//                 </button>
//               </div>
//             </div>
//           </article>
//         `;
//       }).join("")}
//     </div>
//   `;
// }

// function renderCabCards(cabs) {
//   return `
//     <div class="cards">
//       ${(cabs || []).map((c, i) => {
//         const isChosen = selectedCab && selectedCab.name === c.name;
//         return `
//           <article class="data-card provider-card ${isChosen ? 'is-selected-card' : ''}">
//             <div class="card-header-row">
//               <div>
//                 <h4>🚗 ${esc(c.name)}</h4>
//                 <span class="sub-code">${esc(c.route)}</span>
//               </div>
//               <span class="status-badge ESTIMATED">ESTIMATED</span>
//             </div>
//             <div class="card-section">
//               <span class="card-label">Vehicle & Service:</span>
//               <p class="card-text">${esc(c.vehicle || "Dedicated AC vehicle")} · ${esc(c.duration || "On schedule")}</p>
//             </div>
//             <div class="card-action-row provider-action-row">
//               <div class="price-block">
//                 <span class="price-val">${esc(c.price || `₹${c.price_num}`)}</span>
//                 <small>fixed rate</small>
//               </div>
//               <button class="primary ${isChosen ? 'added-btn' : ''}" type="button" onclick="toggleCabSelection(${i})">
//                 ${isChosen ? '✓ In Itinerary' : '+ Add to Itinerary'}
//               </button>
//             </div>
//           </article>
//         `;
//       }).join("")}
//     </div>
//   `;
// }

// function renderBudgetBreakdown(trip) {
//   const flightCost = selectedFlight ? (selectedFlight.price_num || parseCurrencyNum(selectedFlight.price)) : 0;
//   const hotelCost = selectedHotel ? (selectedHotel.total_num || parseCurrencyNum(selectedHotel.total_price)) : 0;
//   const cabCost = selectedCab ? (selectedCab.price_num || parseCurrencyNum(selectedCab.price)) : 0;
  
//   let activitiesCost = 0;
//   (trip.itinerary_items || []).forEach(act => {
//     if (!act.is_flight_entry && !act.is_hotel_entry && !act.is_cab_entry) {
//       if (act.cost) activitiesCost += Number(act.cost);
//     }
//   });

//   const confirmedTotal = flightCost + hotelCost + cabCost + activitiesCost;
//   const userBudget = trip.request?.budget ? Number(trip.request.budget) : null;
  
//   let budgetComparison = "";
//   if (userBudget) {
//     if (confirmedTotal <= userBudget) {
//       budgetComparison = `<span class="budget-status-tag ok">✓ Within target budget (₹${(userBudget - confirmedTotal).toLocaleString("en-IN")} buffer remaining)</span>`;
//     } else {
//       budgetComparison = `<span class="budget-status-tag warning">⚠️ Exceeds target budget by ₹${(confirmedTotal - userBudget).toLocaleString("en-IN")}</span>`;
//     }
//   }

//   return section("Live Budget Breakdown & Cost Summary", `
//     <div class="budget-summary-box">
//       <div class="budget-grid-rich">
//         <div class="budget-item ${selectedFlight ? 'is-confirmed' : 'is-pending'}">
//           <div class="budget-item-title">
//             <span>✈️ Flights</span>
//             <small>${selectedFlight ? `Selected (${selectedFlight.airline})` : 'Not added yet'}</small>
//           </div>
//           <strong class="budget-item-amount">${flightCost ? `₹${flightCost.toLocaleString("en-IN")}` : '₹0'}</strong>
//         </div>

//         <div class="budget-item ${selectedHotel ? 'is-confirmed' : 'is-pending'}">
//           <div class="budget-item-title">
//             <span>🏨 Accommodation</span>
//             <small>${selectedHotel ? `Selected (${selectedHotel.name.slice(0, 18)}...)` : 'Not added yet'}</small>
//           </div>
//           <strong class="budget-item-amount">${hotelCost ? `₹${hotelCost.toLocaleString("en-IN")}` : '₹0'}</strong>
//         </div>

//         <div class="budget-item ${selectedCab ? 'is-confirmed' : 'is-pending'}">
//           <div class="budget-item-title">
//             <span>🚗 Local Cabs / Transfers</span>
//             <small>${selectedCab ? `Selected (${selectedCab.name})` : 'Optional'}</small>
//           </div>
//           <strong class="budget-item-amount">${cabCost ? `₹${cabCost.toLocaleString("en-IN")}` : '₹0'}</strong>
//         </div>

//         <div class="budget-item is-confirmed">
//           <div class="budget-item-title">
//             <span>🎟️ Activities & Sightseeing</span>
//             <small>Estimated from itinerary</small>
//           </div>
//           <strong class="budget-item-amount">${activitiesCost ? `₹${activitiesCost.toLocaleString("en-IN")}` : '₹0'}</strong>
//         </div>
//       </div>

//       <div class="budget-total-row">
//         <div>
//           <span class="total-label">Total Selected & Scheduled Cost</span>
//           ${budgetComparison}
//         </div>
//         <div class="total-amount-display">
//           ₹${confirmedTotal.toLocaleString("en-IN")}
//         </div>
//       </div>
//     </div>
//   `, "Real-Time Tally");
// }

// function renderTravelInsights(insights) {
//   if (!insights) return "";
  
//   const photoSpots = (insights.photo_spots || []).map(p => `<li>📸 <b>Photo Spot:</b> ${esc(p)}</li>`).join("");
//   const foodTips = (insights.culinary_tips || []).map(f => `<li>🍲 <b>Culinary Tip:</b> ${esc(f)}</li>`).join("");
//   const transitTips = (insights.transit_hacks || []).map(t => `<li>🚕 <b>Transit Advice:</b> ${esc(t)}</li>`).join("");
//   const packingTips = (insights.packing_and_safety || []).map(k => `<li>🧳 <b>Packing & Safety:</b> ${esc(k)}</li>`).join("");
//   const creatorHighlights = (insights.creator_insights || []).map(c => `<div class="creator-insight-pill">✨ ${esc(c)}</div>`).join("");

//   return section("💡 Creator Travel Insights & Local Recommendations", `
//     <div class="insights-summary-container">
//       <div class="creator-highlights-block">
//         <strong>✨ Top Creator Takeaways & Verified Secrets</strong>
//         <div class="creator-pills-list">${creatorHighlights}</div>
//       </div>
      
//       <div class="insights-columns-grid">
//         <div class="insights-col">
//           <h4>📸 Viewpoints & Photography</h4>
//           <ul class="insights-list">${photoSpots}</ul>
//         </div>
//         <div class="insights-col">
//           <h4>🍲 Local Culinary & Dining</h4>
//           <ul class="insights-list">${foodTips}</ul>
//         </div>
//         <div class="insights-col">
//           <h4>🚕 Local Navigation & Transit</h4>
//           <ul class="insights-list">${transitTips}</ul>
//         </div>
//         <div class="insights-col">
//           <h4>🧳 Packing, Clothing & Safety</h4>
//           <ul class="insights-list">${packingTips}</ul>
//         </div>
//       </div>
//     </div>
//   `, "Synthesized Wisdom");
// }

// function renderTrip(trip) {
//   latestTrip = trip;
//   const req = trip.request;
//   const plan = trip.selected_destination || req.destination || "Selected Destination";
  
//   const tripSummaryHtml = `
//     <div class="trip-summary-banner">
//       <div class="summary-hero">
//         <div class="summary-dest-title">
//           <h2>🌴 ${esc(plan)}</h2>
//           <span class="origin-tag">Starting from <b>${esc(req.origin)}</b></span>
//         </div>
//         <div class="summary-chips">
//           <span class="summary-chip">📅 ${esc(req.start_date)} to ${esc(req.end_date)}</span>
//           <span class="summary-chip">👥 ${esc(req.travelers)} Traveller(s) (${esc(req.traveler_type || 'Solo')})</span>
//           <span class="summary-chip">⏱️ ${esc(req.pace)} pace</span>
//           <span class="summary-chip">🏨 ${esc(req.accommodation)}</span>
//         </div>
//       </div>
//     </div>
//   `;

//   const dashboardHtml = `
//     ${tripSummaryHtml}
//     ${section("Day-by-Day Verified Itinerary", renderItinerary(trip.itinerary_items), "Interactive Schedule")}
//     ${section("Flight Options (Select to add to Itinerary)", renderFlightCards(trip.flights), "Live / Estimated")}
//     <div id="hotelRecommendationsSection">
//       ${section("Accommodation Recommendations (Select to add to Itinerary)", renderHotelCards(trip.hotels), "Verified Stays")}
//     </div>
//     ${section("Local Transport & Cabs (Select to add to Itinerary)", renderCabCards(trip.cabs), "Transfers")}
//     ${renderBudgetBreakdown(trip)}
//     ${renderTravelInsights(trip.travel_insights)}
//   `;

//   $("tripId").textContent = `Trip Ref: ${trip.trip_id || "tripmate-verified-plan"}`;
//   $("resultBox").innerHTML = dashboardHtml;
//   $("resultSection").classList.remove("hidden");
//   $("assistantLauncher").classList.remove("hidden");
//   $("progressPanel").classList.add("hidden");
// }

// // -------------------------------------------------------------
// // PROGRESS RENDER
// // -------------------------------------------------------------
// function renderProgress(items, activeLabel = "") {
//   $("progressPanel").classList.remove("hidden");
//   $("resultSection").classList.add("hidden");
//   $("progressList").innerHTML = (items || []).map(x => `
//     <div class="${x.label === activeLabel ? "progress-active" : ""}">
//       <span>${x.label === activeLabel ? '<span class="loader"></span>' : "✓"}</span>
//       ${esc(x.label)}
//     </div>
//   `).join("");
// }

// // -------------------------------------------------------------
// // TRIP GENERATION FORM SUBMIT
// // -------------------------------------------------------------
// $("tripForm").onsubmit = async event => {
//   event.preventDefault();
//   const submitButton = $("planSubmitBtn");
//   const cancelButton = $("planCancelBtn");
//   tripController = new AbortController();
//   submitButton.disabled = true;
//   cancelButton.classList.remove("hidden");
//   submitButton.innerHTML = '<span class="loader"></span> Researching with Multi-Agent Graph...';

//   const destText = $("destination").value.trim();
//   const destList = destText.includes(",") ? destText.split(",").map(s => s.trim()) : [destText];

//   const payload = {
//     planning_mode: "known",
//     destination: destText,
//     selected_destinations: destList,
//     origin: $("origin").value.trim(),
//     start_date: $("startDate").value,
//     end_date: $("endDate").value,
//     travelers: Number($("travelers").value),
//     traveler_type: $("travelerType").value,
//     budget: $("budget").value ? Number($("budget").value) : null,
//     currency: $("currency").value,
//     interests: Array.from(selectedInterests),
//     pace: $("pace").value,
//     accommodation: $("accommodation").value,
//     special_requirements: $("requirements").value.trim() || null
//   };

//   renderProgress([
//     { label: "1. Normalizing trip requirements..." },
//     { label: "2. Researching seasonal climate & weather..." },
//     { label: "3. Verifying attractions & events..." },
//     { label: "4. Checking flights, stays & transfers..." },
//     { label: "5. Gemini synthesizing day-by-day verified itinerary & insights..." }
//   ], "1. Normalizing trip requirements...");

//   try {
//     const response = await fetch("/api/trips", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload),
//       signal: tripController.signal
//     });

//     const data = await response.json();
//     if (!response.ok || !data.success) {
//       throw new Error(data.error || "Could not generate trip plan.");
//     }

//     const trip = buildTripViewModel(payload, data.trip);
//     renderTrip(trip);
//     $("resultSection").scrollIntoView({ behavior: "smooth", block: "start" });

//   } catch (error) {
//     $("progressList").innerHTML = error.name === "AbortError"
//       ? '<div class="error">Research paused. You can start it again when ready.</div>'
//       : `<div class="error">${esc(error.message)}</div>`;
//   } finally {
//     submitButton.disabled = false;
//     submitButton.innerHTML = 'Generate Multi-Agent Trip Plan <span>→</span>';
//     cancelButton.classList.add("hidden");
//     tripController = null;
//   }
// };

// $("planCancelBtn")?.addEventListener("click", () => {
//   tripController?.abort();
// });

// // -------------------------------------------------------------
// // REPLANNING AGENT INTERACTION (WITH DYNAMIC HOTEL SEARCH SUPPORT)
// // -------------------------------------------------------------
// function openChangeAssistant(msg = "") {
//   $("changeAssistant").classList.remove("hidden");
//   if (msg) $("changeText").placeholder = msg;
// }

// $("assistantLauncher").onclick = () => openChangeAssistant();
// $("adjustPlanBtn")?.addEventListener("click", () => openChangeAssistant());
// document.querySelector(".assistant-close").onclick = () => $("changeAssistant").classList.add("hidden");

// async function handleReplanning(changeText) {
//   if (!latestTrip || !changeText.trim()) return;
  
//   openChangeAssistant(`Replanning Agent: Applying "${changeText}"...`);
//   const applyBtn = $("applyChange");
//   applyBtn.disabled = true;

//   try {
//     const response = await fetch("/api/trips/replan", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         trip_id: latestTrip.trip_id || "current",
//         change_text: changeText,
//         itinerary: (latestTrip.itinerary_items || []).filter(act => !act.is_flight_entry && !act.is_hotel_entry && !act.is_cab_entry).map(act => ({
//           date: act.date,
//           start_time: act.start_time,
//           end_time: act.end_time || "Flexible",
//           title: act.title,
//           location: act.location,
//           description: act.description,
//           estimated_cost: act.cost,
//           cost_status: act.status || "ESTIMATED",
//           reason: act.reason || act.description
//         })),
//         trip_context: {
//           destination: latestTrip.selected_destination,
//           origin: latestTrip.request?.origin,
//           pace: latestTrip.request?.pace
//         }
//       })
//     });

//     const data = await response.json();
//     if (!response.ok || !data.success) {
//       throw new Error(data.error || "Replanning failed.");
//     }

//     // If new hotels were searched and returned by the agent
//     if (data.updated_hotels && data.updated_hotels.length > 0) {
//       latestTrip.hotels = data.updated_hotels.map((h, i) => ({
//         ...h,
//         total_num: parseCurrencyNum(h.total_price || h.price_num || h.price) || (12000 + i * 3500)
//       }));
//       showToast(`✓ Found ${data.updated_hotels.length} verified hotels matching "${changeText}"!`);
//     }

//     // Convert updated activities back
//     const updatedActivities = data.itinerary.map(act => ({
//       date: act.date,
//       start_time: act.start_time,
//       end_time: act.end_time || "Flexible",
//       title: act.title,
//       location: act.location,
//       description: act.description,
//       reason: act.reason || "Updated by Replanning Agent",
//       status: act.cost_status || "VERIFIED",
//       cost: act.estimated_cost ? Number(act.estimated_cost) : null,
//       cost_text: act.estimated_cost ? `₹${Number(act.estimated_cost).toLocaleString("en-IN")}` : "Included",
//       is_custom: true
//     }));

//     // Re-attach confirmed flights/hotels/cabs if selected
//     if (selectedFlight) {
//       updatedActivities.unshift({
//         date: latestTrip.request.start_date,
//         start_time: selectedFlight.departure || "08:30",
//         end_time: selectedFlight.arrival || "11:45",
//         title: `✈️ Confirmed Flight: ${selectedFlight.airline} (${selectedFlight.flight_number || "Direct"})`,
//         location: `${latestTrip.request.origin} → ${latestTrip.selected_destination}`,
//         description: `Confirmed transit flight. Baggage: ${selectedFlight.cabin || "Standard allowance"}.`,
//         reason: "Confirmed Travel Booking",
//         status: "VERIFIED",
//         cost: selectedFlight.price_num,
//         cost_text: selectedFlight.price,
//         is_flight_entry: true
//       });
//     }

//     if (selectedHotel) {
//       updatedActivities.splice(1, 0, {
//         date: latestTrip.request.start_date,
//         start_time: "14:00",
//         end_time: "15:00",
//         title: `🏨 Confirmed Stay: Check-in at ${selectedHotel.name}`,
//         location: selectedHotel.area || latestTrip.selected_destination,
//         description: `Confirmed accommodation. ${selectedHotel.amenities || "Breakfast & WiFi included"}.`,
//         reason: "Accommodation Check-in",
//         status: "VERIFIED",
//         cost: selectedHotel.total_num,
//         cost_text: selectedHotel.total_price,
//         is_hotel_entry: true
//       });
//     }

//     latestTrip.itinerary_items = updatedActivities;
//     renderTrip(latestTrip);
//     showToast(`✓ ${data.change_summary || "Itinerary adjusted successfully!"}`);
//     $("changeText").value = "";

//   } catch (err) {
//     alert("Replanning error: " + err.message);
//   } finally {
//     applyBtn.disabled = false;
//   }
// }

// $("applyChange").onclick = () => handleReplanning($("changeText").value);
// $("changeText").addEventListener("keypress", e => {
//   if (e.key === "Enter") handleReplanning($("changeText").value);
// });

// document.querySelectorAll(".quick-changes button").forEach(btn => {
//   btn.onclick = () => handleReplanning(btn.dataset.replan || btn.textContent);
// });

// function downloadPlan() {
//   if (!latestTrip) return;
//   if (typeof html2pdf === "undefined") {
//     alert("PDF generator is loading. Please try again in a moment.");
//     return;
//   }
//   html2pdf().set({
//     margin: 0.4,
//     filename: `TripMate-${(latestTrip.selected_destination || 'trip').replace(/\s+/g, '_')}.pdf`,
//     html2canvas: { scale: 2, backgroundColor: "#07111f" },
//     jsPDF: { unit: "in", format: "a4", orientation: "portrait" }
//   }).from($("resultBox")).save();
// }

// async function payForHotel(hotel, tripId, travelers = 1) {
//     try {
//         if (!hotel || !tripId) {
//             throw new Error("Hotel or trip information is missing.");
//         }

//         const amount = Number(hotel.price_num);

//         if (!amount || amount <= 0) {
//             throw new Error("Valid hotel price is required.");
//         }

//         /*
//          * ---------------------------------------------------------
//          * AGENT ACTION 1
//          * Payment Agent asks backend to create a Razorpay order.
//          * ---------------------------------------------------------
//          */

//         const orderResponse = await fetch(
//             "/api/payments/hotel/order",
//             {
//                 method: "POST",
//                 headers: {
//                     "Content-Type": "application/json"
//                 },
//                 body: JSON.stringify({
//                     trip_id: tripId,
//                     travelers: travelers,
//                     hotel: hotel
//                 })
//             }
//         );

//         const orderData = await orderResponse.json();

//         if (!orderResponse.ok || !orderData.success) {
//             throw new Error(
//                 orderData.error ||
//                 "Could not create payment order."
//             );
//         }

//         const payment = orderData.payment;

//         /*
//          * ---------------------------------------------------------
//          * RAZORPAY CHECKOUT
//          * ---------------------------------------------------------
//          */

//         const options = {
//             key: payment.key_id,

//             amount: payment.amount,

//             currency: payment.currency,

//             name: "TripMate AI",

//             description:
//                 `Accommodation booking - ${payment.hotel_name}`,

//             order_id: payment.order_id,

//             theme: {
//                 color: "#3399cc"
//             },

//             /*
//              * Optional customer prefill.
//              * Do NOT put secret information here.
//              */
//             prefill: {
//                 name: "",
//                 email: "",
//                 contact: ""
//             },

//             notes: {
//                 trip_id: tripId,
//                 booking_type: "accommodation"
//             },

//             /*
//              * Razorpay returns these values after successful checkout.
//              */
//             handler: async function (response) {

//                 console.log(
//                     "[PAYMENT AGENT] Razorpay payment completed",
//                     response
//                 );

//                 await verifyHotelPayment(
//                     hotel,
//                     tripId,
//                     response
//                 );
//             }
//         };

//         const razorpay = new Razorpay(options);

//         razorpay.on(
//             "payment.failed",
//             function (response) {

//                 console.error(
//                     "[PAYMENT AGENT] Payment failed",
//                     response
//                 );

//                 showPaymentMessage(
//                     "Payment failed: " +
//                     (
//                         response.error?.description ||
//                         "Unknown payment error"
//                     ),
//                     "error"
//                 );
//             }
//         );

//         razorpay.open();

//     } catch (error) {

//         console.error(
//             "[PAYMENT AGENT] Order creation failed:",
//             error
//         );

//         showPaymentMessage(
//             error.message,
//             "error"
//         );
//     }
// }

// async function verifyHotelPayment(
//     hotel,
//     tripId,
//     razorpayResponse
// ) {
//     try {

//         /*
//          * ---------------------------------------------------------
//          * AGENT ACTION 2
//          *
//          * Send Razorpay result to backend.
//          *
//          * Backend verifies the cryptographic signature.
//          * ---------------------------------------------------------
//          */

//         const response = await fetch(
//             "/api/payments/hotel/verify",
//             {
//                 method: "POST",

//                 headers: {
//                     "Content-Type": "application/json"
//                 },

//                 body: JSON.stringify({
//                     trip_id: tripId,

//                     hotel: hotel,

//                     razorpay_order_id:
//                         razorpayResponse.razorpay_order_id,

//                     razorpay_payment_id:
//                         razorpayResponse.razorpay_payment_id,

//                     razorpay_signature:
//                         razorpayResponse.razorpay_signature
//                 })
//             }
//         );

//         const data = await response.json();

//         if (
//             !response.ok ||
//             !data.success ||
//             !data.payment_verified
//         ) {
//             throw new Error(
//                 data.error ||
//                 "Payment verification failed."
//             );
//         }

//         console.log(
//             "[PAYMENT AGENT] Payment verified",
//             data
//         );

//         showPaymentMessage(
//             `Payment successful for ${hotel.name}`,
//             "success"
//         );

//         /*
//          * ---------------------------------------------------------
//          * AGENT ACTION 3
//          *
//          * Tell TripMate that accommodation payment is confirmed.
//          * ---------------------------------------------------------
//          */

//         await confirmAccommodationBooking(
//             hotel,
//             tripId,
//             data.payment
//         );

//     } catch (error) {

//         console.error(
//             "[PAYMENT AGENT] Verification failed:",
//             error
//         );

//         showPaymentMessage(
//             error.message,
//             "error"
//         );
//     }
// }

// async function confirmAccommodationBooking(
//     hotel,
//     tripId,
//     payment
// ) {
//     try {

//         const response = await fetch(
//             "/api/trips/" +
//             encodeURIComponent(tripId) +
//             "/accommodation/confirm",
//             {
//                 method: "POST",

//                 headers: {
//                     "Content-Type": "application/json"
//                 },

//                 body: JSON.stringify({
//                     hotel: hotel,

//                     payment: {
//                         payment_id:
//                             payment.payment_id,

//                         order_id:
//                             payment.order_id,

//                         status:
//                             payment.status,

//                         amount:
//                             payment.amount,

//                         currency:
//                             payment.currency
//                     }
//                 })
//             }
//         );

//         const data = await response.json();

//         if (!response.ok || !data.success) {
//             throw new Error(
//                 data.error ||
//                 "Accommodation confirmation failed."
//             );
//         }

//         console.log(
//             "[BOOKING AGENT] Accommodation confirmed",
//             data
//         );

//         showPaymentMessage(
//             "🏨 Accommodation confirmed and added to your trip.",
//             "success"
//         );

//         /*
//          * Refresh dashboard if your application already
//          * has a rendering function.
//          */

//         if (typeof renderTripDashboard === "function") {
//             renderTripDashboard(data.trip);
//         }

//     } catch (error) {

//         console.error(
//             "[BOOKING AGENT]",
//             error
//         );

//         showPaymentMessage(
//             "Payment succeeded, but booking confirmation needs attention: " +
//             error.message,
//             "error"
//         );
//     }
// }

// function showPaymentMessage(message, type = "success") {

//     let element =
//         document.getElementById(
//             "paymentStatusMessage"
//         );

//     if (!element) {

//         element =
//             document.createElement("div");

//         element.id =
//             "paymentStatusMessage";

//         element.style.position = "fixed";
//         element.style.bottom = "24px";
//         element.style.right = "24px";
//         element.style.zIndex = "99999";
//         element.style.padding = "16px 20px";
//         element.style.borderRadius = "12px";
//         element.style.background =
//             type === "success"
//                 ? "#166534"
//                 : "#991b1b";

//         element.style.color = "white";
//         element.style.fontWeight = "600";

//         document.body.appendChild(element);
//     }

//     element.textContent = message;

//     setTimeout(() => {
//         element.remove();
//     }, 5000);
// }

// // -------------------------------------------------------------
// // DISCOVERY TO BASE PAGE HANDOFF INITIALIZATION
// // -------------------------------------------------------------
// window.addEventListener("DOMContentLoaded", () => {
//   const todayStr = new Date().toISOString().split("T")[0];
//   $("startDate").min = todayStr;
//   $("endDate").min = todayStr;

//   const urlParams = new URLSearchParams(window.location.search);
//   const fromDiscovery = urlParams.get("from_discovery") === "true";
//   let storedStartDate = "";
//   let storedEndDate = "";
//   if (fromDiscovery) {
//     try {
//       storedStartDate = sessionStorage.getItem("tripmate_discovery_start_date") || "";
//       storedEndDate = sessionStorage.getItem("tripmate_discovery_end_date") || "";
//     } catch (e) {}
//   }
//   const destParam = urlParams.get("destination");
//   const originParam = urlParams.get("origin");
//   const monthParam = urlParams.get("month");
//   const yearParam = urlParams.get("year") || "2026";
//   const startDateParam = urlParams.get("start_date") || urlParams.get("startDate") || storedStartDate;
//   const endDateParam = urlParams.get("end_date") || urlParams.get("endDate") || storedEndDate;
//   const daysParam = Number(urlParams.get("days")) || 5;
//   const paceParam = urlParams.get("pace");
//   const budgetParam = urlParams.get("budget");
//   const autostart = urlParams.get("autostart") === "true";

//   if (destParam) {
//     $("destination").value = destParam;
//     if (originParam) $("origin").value = originParam;
//     if (paceParam) $("pace").value = paceParam;
//     if (budgetParam) $("budget").value = budgetParam;

//     if (startDateParam && endDateParam) {
//       $("startDate").value = startDateParam;
//       $("endDate").value = endDateParam;
//     } else if (monthParam) {
//       const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
//       const mIdx = monthNames.indexOf(monthParam);
//       if (mIdx !== -1) {
//         const mm = String(mIdx + 1).padStart(2, "0");
//         $("startDate").value = `${yearParam}-${mm}-10`;
//         const endDate = new Date(Number(yearParam), mIdx, 10 + daysParam - 1);
//         $("endDate").value = endDate.toISOString().split("T")[0];
//       }
//     } else {
//       const tomorrow = new Date();
//       tomorrow.setDate(tomorrow.getDate() + 1);
//       const after4 = new Date(tomorrow);
//       after4.setDate(after4.getDate() + 4);
//       $("startDate").value = tomorrow.toISOString().split("T")[0];
//       $("endDate").value = after4.toISOString().split("T")[0];
//     }

//     if (fromDiscovery) {
//       const banner = $("discoveryHandoffBanner");
//       banner.classList.remove("hidden");
//       $("handoffTitle").textContent = `✨ Loaded: ${destParam} for ${monthParam || ''} ${yearParam}`;
//       $("handoffDesc").textContent = `Starting from ${originParam || 'your location'}. Verified multi-agent inputs pre-filled.`;

//       $("clearHandoffBtn").onclick = () => {
//         banner.classList.add("hidden");
//         window.history.replaceState({}, document.title, "/");
//       };
//     }

//     if (autostart) {
//       setTimeout(() => {
//         $("tripForm").requestSubmit();
//       }, 350);
//     }
//   } else {
//     const start = new Date();
//     start.setDate(start.getDate() + 7);
//     const end = new Date(start);
//     end.setDate(end.getDate() + 4);
//     if (!$("startDate").value) $("startDate").value = start.toISOString().split("T")[0];
//     if (!$("endDate").value) $("endDate").value = end.toISOString().split("T")[0];
//   }
// });

let mode = "known";
let selectedInterests = new Set();
let latestTrip = null;
let selectedFlight = null;
let selectedHotel = null;
let selectedCab = null;
let tripController = null;

function updatePaymentAgentPanel(state) {
  const panel = document.getElementById("paymentAgentPanel");
  if (!panel) return;
  panel.classList.remove("hidden");
  const statusText = document.getElementById("paymentAgentStatusText");
  const orderText = document.getElementById("paymentAgentOrderText");
  const progressEl = document.getElementById("paymentAgentProgress");
  const documentsEl = document.getElementById("paymentAgentDocuments");
  if (statusText) statusText.textContent = state?.status || "Preparing sandbox booking";
  if (orderText) orderText.textContent = state?.booking_id || state?.transaction_id || "—";
  if (progressEl && Array.isArray(state?.progress)) {
    progressEl.innerHTML = state.progress
      .map(event => `<div class="${event.status === "failed" ? "failed" : "complete"}">${esc(event.status === "failed" ? "✗" : "✓")} ${esc(event.step)}</div>`)
      .join("");
  }
  const documents = state?.payment?.documents;
  const downloadButton = document.getElementById("downloadDemoDocsBtn");
  if (downloadButton) downloadButton.classList.toggle("hidden", !documents);
  if (documentsEl && documents) {
    documentsEl.innerHTML = Object.entries(documents)
      .filter(([key]) => key !== "label")
        .map(([key, document]) => {
          const rows = Object.entries(document)
            .filter(([field, value]) => field !== "label" && !Array.isArray(value) && value !== null && typeof value !== "object")
            .map(([field, value]) => {
              const displayValue = field === "amount_minor"
                ? `₹${(Number(value) / 100).toLocaleString("en-IN")}`
                : String(value);
              return `<div><dt>${esc(field.replaceAll("_", " "))}</dt><dd>${esc(displayValue)}</dd></div>`;
            })
            .join("");
          return `<article class="payment-document"><strong>${esc(key.replaceAll("_", " "))}</strong><dl>${rows}</dl></article>`;
        })
        .join("");
    }
  }

const $ = id => document.getElementById(id);

const esc = x =>
  String(x ?? "Information unavailable").replace(
    /[&<>'"]/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[c])
  );

async function refreshDemoWallet() {
  const balance = $("walletBalance");
  if (!balance) return;
  try {
    const response = await fetch("/api/sandbox/wallet");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Wallet unavailable");
    balance.textContent = `₹${(Number(data.available_minor || 0) / 100).toLocaleString("en-IN")}`;
  } catch (_) {
    balance.textContent = "Unavailable";
  }
}

async function completeSandboxPurchase(providerType, option) {
  if (!latestTrip?.trip_id || !option) return;
  const checkoutWindow = window.open("about:blank", "tripmate-agent-checkout", "width=760,height=850");
  if (checkoutWindow) {
    checkoutWindow.document.write("<!doctype html><title>Agent checkout</title><main style='font:16px Arial;max-width:680px;margin:48px auto;padding:24px'><h1>Payment agent checkout</h1><p id='agent-status'>Validating your selected sandbox quote…</p><ol id='agent-steps'><li>Checking selected service, wallet balance, and transaction rules.</li></ol><p>Sandbox only. No real money or supplier reservation.</p></main>");
    checkoutWindow.document.close();
  }
  const panel = document.getElementById("paymentAgentPanel");
  panel?.classList.remove("hidden");
  updatePaymentAgentPanel({status: "Payment agent is validating the selected quote…", progress: [
    {step: "Traveler selection received; payment agent is checking quote, wallet, and policy.", status: "complete"}
  ]});
  try {
    const response = await fetch(`/api/trips/${encodeURIComponent(latestTrip.trip_id)}/selections`, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({trip_id: latestTrip.trip_id, provider_type: providerType, option,
        trip_context: {...(latestTrip.request || {}), destination: latestTrip.selected_destination}})
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || data.message || "Sandbox booking failed.");
    const booking = data.sandbox_booking;
    latestTrip.demo_booking = booking;
    latestTrip.sandbox_bookings = [...(latestTrip.sandbox_bookings || []), booking];
    const item = booking?.payment?.items?.[0];
    if (!Array.isArray(latestTrip.itinerary_items)) latestTrip.itinerary_items = [];
    const paidAmount = (item?.amount_minor || 0) / 100;
    if (providerType === "hotel") {
      selectedHotel = {...option, total_num: paidAmount};
      latestTrip.itinerary_items = latestTrip.itinerary_items.filter(activity => !activity.is_hotel_entry);
      latestTrip.itinerary_items.push({date: latestTrip.request?.start_date, start_time: "14:00", end_time: "15:00",
        title: `🏨 Confirmed stay: ${option.name}`, location: option.area || latestTrip.selected_destination,
        description: `Sandbox booking confirmed · ${latestTrip.request?.start_date} to ${latestTrip.request?.end_date}`,
        reason: "Payment agent booking confirmation", status: "CONFIRMED", cost: paidAmount,
        cost_text: `₹${paidAmount.toLocaleString("en-IN")}`, is_hotel_entry: true, booking_id: booking.booking_id});
    }
    if (providerType === "cab") {
      selectedCab = {...option, price_num: paidAmount};
      latestTrip.itinerary_items = latestTrip.itinerary_items.filter(activity => !activity.is_cab_entry);
      latestTrip.itinerary_items.push({date: latestTrip.request?.start_date, start_time: "12:00", end_time: "13:00",
        title: `🚗 Confirmed transfer: ${option.name}`, location: option.route || latestTrip.selected_destination,
        description: `${option.vehicle || "Local transfer"} · sandbox booking confirmed`, reason: "Payment agent booking confirmation",
        status: "CONFIRMED", cost: paidAmount, cost_text: `₹${paidAmount.toLocaleString("en-IN")}`,
        is_cab_entry: true, booking_id: booking.booking_id});
    }
    updatePaymentAgentPanel({...booking, status: "Sandbox booking confirmed", progress: booking.progress || []});
    if (checkoutWindow && !checkoutWindow.closed) {
      const status = checkoutWindow.document.getElementById("agent-status");
      const steps = checkoutWindow.document.getElementById("agent-steps");
      if (status) status.textContent = `Payment and ${providerType} booking completed: ${booking.booking_id || booking.payment_id || "confirmed"}.`;
      if (steps) steps.innerHTML = (booking.progress || []).map(step => `<li>${esc(step.step)}</li>`).join("");
      checkoutWindow.document.body.insertAdjacentHTML("beforeend", "<p><strong>Confirmed in TripMate sandbox.</strong> Return to the trip plan for the refreshed itinerary and booking PDF.</p>");
    }
    await refreshDemoWallet();
    renderTrip(latestTrip);
    showToast("Payment agent confirmed the sandbox booking. Itinerary updated.");
  } catch (error) {
    if (checkoutWindow && !checkoutWindow.closed) {
      const status = checkoutWindow.document.getElementById("agent-status");
      if (status) status.textContent = `Checkout stopped: ${error.message}`;
    }
    updatePaymentAgentPanel({status: "Sandbox payment could not be completed", progress: [
      {step: error.message, status: "failed"}
    ]});
    showToast(error.message);
  }
}

refreshDemoWallet();

$("walletTopUpBtn")?.addEventListener("click", async () => {
  const rupees = Number($("walletTopUpAmount")?.value);
  if (!Number.isSafeInteger(rupees) || rupees < 1 || rupees > 1000000) {
    showPaymentMessage("Enter a whole rupee amount between ₹1 and ₹1,000,000.", "error");
    return;
  }
  const button = $("walletTopUpBtn");
  button.disabled = true;
  try {
    const response = await fetch("/api/sandbox/wallet/topups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount_minor: rupees * 100,
        idempotency_key: window.crypto?.randomUUID?.() || `topup-${Date.now()}`
      })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Wallet top-up failed.");
    $("walletBalance").textContent = `₹${(Number(result.wallet.available_minor) / 100).toLocaleString("en-IN")}`;
    showPaymentMessage("Simulated wallet funds added. No real money was collected.", "success");
  } catch (error) {
    showPaymentMessage(error.message || "Wallet top-up failed.", "error");
  } finally {
    button.disabled = false;
  }
});


// =============================================================
// MODE SELECTION
// =============================================================

document.querySelectorAll(".mode-card").forEach(button => {
  button.onclick = () => {
    mode = button.dataset.mode;

    document
      .querySelectorAll(".mode-card")
      .forEach(x => x.classList.toggle("active", x === button));

    if (mode === "discover") {
      window.location.href = "/discover";
      return;
    }

    document
      .querySelector(".destination-field")
      .classList.remove("hidden");

    $("destination").required = true;
  };
});


// =============================================================
// INTERESTS
// =============================================================

$("interests")?.addEventListener("click", event => {
  if (event.target.tagName !== "BUTTON") return;

  const tag = event.target.textContent.trim();

  if (selectedInterests.has(tag)) {
    selectedInterests.delete(tag);
    event.target.classList.remove("selected");
  } else {
    selectedInterests.add(tag);
    event.target.classList.add("selected");
  }
});


// =============================================================
// HELPERS
// =============================================================

function section(title, body, badge = "", id = "") {
  return `
    <section class="dash-section" ${id ? `id="${esc(id)}"` : ""}>
      <div class="dash-section-header">
        <h3>${esc(title)}</h3>
        ${badge ? `<span class="section-tag">${esc(badge)}</span>` : ""}
      </div>
      ${body}
    </section>
  `;
}


function parseCurrencyNum(val) {
  if (!val) return 0;

  const clean = String(val).replace(/[^0-9.]/g, "");

  return Number(clean) || 0;
}


// =============================================================
// TRIP VIEW MODEL
// =============================================================

function buildTripViewModel(payload, response) {
  const dest =
    payload.destination ||
    payload.selected_destinations?.join(", ") ||
    "Selected Destination";

  const itinerary = (response.itinerary || []).map(activity => ({
    date: activity.date || payload.start_date || "Day 1",
    start_time: activity.start_time || "09:00",
    end_time: activity.end_time || "11:30",
    title: activity.title || "Sightseeing & Exploration",
    location: activity.location || dest,
    description: activity.description || "",
    reason: activity.reason || "",
    status: activity.booking_id
      ? "SIMULATED"
      : activity.cost_status === "UNAVAILABLE"
        ? "ESTIMATED"
        : activity.cost_status || "VERIFIED",
    cost: activity.estimated_cost
      ? Number(activity.estimated_cost)
      : null,
    cost_text: activity.estimated_cost
      ? `₹${Number(activity.estimated_cost).toLocaleString("en-IN")}`
      : "Free / Included",
    is_custom: false,
    is_hotel_entry: Boolean(activity.booking_id),
    booking_id: activity.booking_id,
    document_id: activity.document_id
  }));


  const fallbackInsights = {
    destination: dest,

    photo_spots: [
      `Sunrise lookout overlooking ${dest} hills for panoramic morning mist (06:00–07:30 AM).`,
      "Waterfront / Lake promenade during golden hour for reflection shots.",
      "Traditional spice gardens and heritage market arches for vibrant culture photos."
    ],

    culinary_tips: [
      "Sample authentic regional breakfast at heritage diners.",
      "Visit verified plantation cafes for freshly brewed cardamom & cinnamon tea.",
      "Avoid tourist traps on highway bypasses; seek spots favored by local families."
    ],

    transit_hacks: [
      "Book authorized boats / prepaid taxis in advance to avoid middleman commission at terminals.",
      "Keep small cash notes (₹100/₹200) for entry passes and regional parking.",
      "Start morning transfers before 09:00 AM to beat tourist buses on winding roads."
    ],

    packing_and_safety: [
      "Sturdy footwear with traction for damp pathways and nature trails.",
      "Light rain jacket / compact umbrella and insect repellent.",
      "Respect local dress codes by keeping shoulders and knees covered in cultural sanctuaries."
    ],

    creator_insights: [
      "Top creators recommend the early 07:30 AM boat safari for best wildlife sightings.",
      "Opt for eco-resorts or plantation stays rather than standard transit hotels.",
      "Allow at least 2.5 hours for guided spice plantation walks."
    ]
  };


  return {
    ...response,

    request: payload,

    selected_destination: dest,

    flights: (response.flights || [])
      .filter(f => !f.message && (f.price || f.estimated_cost))
      .map(f => ({
        ...f,
        price_num: parseCurrencyNum(f.price || f.estimated_cost)
      })),

    hotels:
      response.hotels &&
      response.hotels.length > 0
        ? response.hotels.map(h => ({
            ...h,
            total_num: Number.isSafeInteger(Number(h.price_num)) && Number(h.price_num) > 0
              ? Number(h.price_num)
              : 0
          }))
        : [],

    cabs: response.cabs || [],

    travel_insights:
      response.travel_insights ||
      fallbackInsights,

    itinerary_items:
      itinerary.length
        ? itinerary
        : [
            {
              date: payload.start_date,
              start_time: "14:00",
              end_time: "16:00",
              title: `Arrival & Check-in in ${dest}`,
              location: dest,
              description:
                "Arrive from starting city, settle in accommodation, and relax.",
              status: "VERIFIED",
              cost: null,
              cost_text: "Included"
            },
            {
              date: payload.start_date,
              start_time: "18:00",
              end_time: "20:30",
              title: "Evening Scenic Walk & Local Dinner",
              location: dest,
              description:
                "Explore the waterfront/promenade and sample local cuisine.",
              status: "ESTIMATED",
              cost: 800,
              cost_text: "₹800"
            },
            {
              date: payload.end_date,
              start_time: "09:30",
              end_time: "12:30",
              title: `Key Highlights & Heritage of ${dest}`,
              location: dest,
              description:
                "Guided tour through iconic cultural and natural spots.",
              status: "VERIFIED",
              cost: 500,
              cost_text: "₹500"
            },
            {
              date: payload.end_date,
              start_time: "15:00",
              end_time: "17:00",
              title: "Return Transfer & Departure",
              location: dest,
              description:
                "Transfer to airport/station for departure.",
              status: "VERIFIED",
              cost: null,
              cost_text: "Transfer"
            }
          ]
  };
}


// =============================================================
// FLIGHT SELECTION
// =============================================================

function toggleFlightSelection(index) {
  if (!latestTrip) return;

  const flight = latestTrip.flights[index];

  if (
    selectedFlight &&
    selectedFlight.flight_number === flight.flight_number
  ) {
    selectedFlight = null;

    latestTrip.itinerary_items =
      latestTrip.itinerary_items.filter(
        act => !act.is_flight_entry
      );

    showToast("Flight removed from itinerary.");
  } else {
    selectedFlight = flight;

    latestTrip.itinerary_items =
      latestTrip.itinerary_items.filter(
        act => !act.is_flight_entry
      );

    const depDate =
      latestTrip.request.start_date;

    latestTrip.itinerary_items.unshift({
      date: depDate,
      start_time: flight.departure || "08:30",
      end_time: flight.arrival || "11:45",

      title:
        `✈️ Confirmed Flight: ${flight.airline} (${flight.flight_number || "Direct"})`,

      location:
        `${latestTrip.request.origin} → ${latestTrip.selected_destination}`,

      description:
        `Confirmed transit flight. Baggage: ${flight.cabin || "Standard allowance"}.`,

      reason: "Confirmed Travel Booking",

      status: "VERIFIED",

      cost:
        flight.price_num ||
        parseCurrencyNum(flight.price),

      cost_text:
        flight.price ||
        `₹${flight.price_num}`,

      is_flight_entry: true
    });

    showToast(
      `✓ ${flight.airline} added to your Day 1 itinerary!`
    );
  }

  renderTrip(latestTrip);
}


// =============================================================
// AUTONOMOUS DEMO BOOKING
// =============================================================

// =============================================================
// CAB SELECTION
// =============================================================

function toggleCabSelection(index) {
  if (!latestTrip) return;
  const cab = latestTrip.cabs[index];
  completeSandboxPurchase("cab", cab);
}


// =============================================================
// TOAST
// =============================================================

function showToast(msg) {
  let toast =
    $("tripmateToast");

  if (!toast) {
    toast =
      document.createElement("div");

    toast.id =
      "tripmateToast";

    toast.className =
      "app-toast";

    document.body.appendChild(toast);
  }

  toast.textContent = msg;

  toast.classList.add("visible");

  setTimeout(
    () => toast.classList.remove("visible"),
    3200
  );
}


// =============================================================
// ITINERARY RENDER
// =============================================================

function renderItinerary(items) {
  if (!items || !items.length) {
    return `
      <div class="empty-notice">
        No itinerary generated yet.
      </div>
    `;
  }

  const groups = {};

  items.forEach(item => {
    const d = item.date || "Day 1";

    if (!groups[d]) {
      groups[d] = [];
    }

    groups[d].push(item);
  });

  return `
    <div class="itinerary-timeline">

      ${Object.entries(groups)
        .map(
          ([dateKey, acts], dayIdx) => `
            <div class="itinerary-day-block">

              <div class="day-badge-header">
                <span class="day-number">
                  Day ${dayIdx + 1}
                </span>

                <span class="day-date">
                  ${esc(dateKey)}
                </span>
              </div>

              <div class="day-activities">

                ${acts
                  .map(
                    act => `
                      <article
                        class="activity-card
                        ${act.is_flight_entry ? "flight-activity" : ""}
                        ${act.is_hotel_entry ? "hotel-activity" : ""}
                        ${act.is_cab_entry ? "cab-activity" : ""}"
                      >

                        <div class="activity-time-col">
                          <span class="activity-time">
                            ${esc(act.start_time)}
                          </span>

                          ${
                            act.end_time &&
                            act.end_time !== "Flexible"
                              ? `
                                <span class="activity-endtime">
                                  to ${esc(act.end_time)}
                                </span>
                              `
                              : ""
                          }
                        </div>

                        <div class="activity-main-col">

                          <div class="activity-title-row">

                            <h4>
                              ${esc(act.title)}
                            </h4>

                            <span
                              class="status-badge ${
                                act.status === "VERIFIED"
                                  ? "VERIFIED"
                                  : "ESTIMATED"
                              }"
                            >
                              ${esc(act.status)}
                            </span>

                          </div>

                          <div class="activity-location">
                            📍 ${esc(act.location)}
                          </div>

                          <p class="activity-desc">
                            ${esc(act.description)}
                          </p>

                          <div class="activity-footer">

                            ${
                              act.cost_text
                                ? `
                                  <span class="cost-pill">
                                    💰 ${esc(act.cost_text)}
                                  </span>
                                `
                                : `
                                  <span class="cost-pill free">
                                    Included / Free
                                  </span>
                                `
                            }

                            ${
                              act.reason
                                ? `
                                  <span class="reason-tag">
                                    💡 ${esc(act.reason)}
                                  </span>
                                `
                                : ""
                            }

                          </div>

                        </div>

                      </article>
                    `
                  )
                  .join("")}

              </div>
            </div>
          `
        )
        .join("")}

    </div>
  `;
}


// =============================================================
// FLIGHT CARDS
// =============================================================

function renderFlightCards(flights) {
  if (!flights || !flights.length) {
    return `<div class="empty-notice">No live flight fares are available from the connected providers. Flight status data does not include purchasable fares or ticket issuance.</div>`;
  }

  return `
    <div class="cards">

      ${(flights || [])
        .map((f, i) => {

          const isChosen =
            selectedFlight &&
            selectedFlight.flight_number ===
              f.flight_number;

          return `
            <article
              class="data-card provider-card ${
                isChosen
                  ? "is-selected-card"
                  : ""
              }"
            >

              <div class="card-header-row">

                <div>

                  <h4>
                    ✈️ ${esc(f.airline)}
                  </h4>

                  <span class="sub-code">
                    ${esc(
                      f.flight_number ||
                      "Scheduled Flight"
                    )}
                  </span>

                </div>

                <span
                  class="status-badge ${
                    f.status || "ESTIMATED"
                  }"
                >
                  ${esc(
                    f.status ||
                    "ESTIMATED"
                  )}
                </span>

              </div>


              <div class="flight-timings-grid">

                <div class="timing-block">

                  <strong class="time">
                    ${esc(
                      f.departure ||
                      "08:30"
                    )}
                  </strong>

                  <small>
                    ${esc(
                      latestTrip?.request?.origin ||
                      "Origin"
                    )}
                  </small>

                </div>


                <div class="flight-path">

                  <span>
                    ${esc(
                      f.stops ||
                      "Direct"
                    )}
                  </span>

                  <div class="path-line"></div>

                </div>


                <div class="timing-block">

                  <strong class="time">
                    ${esc(
                      f.arrival ||
                      "11:45"
                    )}
                  </strong>

                  <small>
                    ${esc(
                      latestTrip?.selected_destination ||
                      "Destination"
                    )}
                  </small>

                </div>

              </div>


              ${
                f.cabin
                  ? `
                    <div class="card-section">
                      <span class="travel-text">
                        🧳 ${esc(f.cabin)}
                      </span>
                    </div>
                  `
                  : ""
              }


              <div class="card-action-row provider-action-row">

                <div class="price-block">

                  <span class="price-val">
                    ${esc(
                      f.price ||
                      `₹${f.price_num}`
                    )}
                  </span>

                  <small>
                    / person
                  </small>

                </div>


                <button
                  class="primary ${
                    isChosen
                      ? "added-btn"
                      : ""
                  }"
                  type="button"
                  onclick="toggleFlightSelection(${i})"
                >
                  ${
                    isChosen
                      ? "✓ In Itinerary"
                      : "+ Add to Itinerary"
                  }
                </button>

              </div>

            </article>
          `;
        })
        .join("")}

    </div>
  `;
}


// =============================================================
// HOTEL CARDS
// =============================================================

function renderHotelCards(hotels) {

  if (!hotels || !hotels.length) {
    return `
      <div class="empty-notice">
        No hotels found. Use the Replanning Assistant below
        to search hotels near any landmark.
      </div>
    `;
  }


  return `
    <div
      class="cards"
      id="hotelsGridContainer"
    >

      ${(hotels || [])
        .map((h, i) => {

          const isChosen =
            selectedHotel &&
            selectedHotel.name === h.name;

          const confirmedHotel = (latestTrip?.sandbox_bookings || [latestTrip?.demo_booking]).filter(Boolean)
            .find(booking => booking.success && booking.payment?.items?.some(item => item.category === "hotel" && item.name === h.name));
          const isPaid = Boolean(confirmedHotel);
          const isAgentChoice = false;
          const totalAmount = Number(h.total_num) || Number(h.price_num) || 0;
          const displayPrice = totalAmount > 0
            ? `₹${totalAmount.toLocaleString("en-IN")}`
            : "Not eligible";
          const quote = h.quote || {};
          const nightlyAmount = Number(quote.nightly_rate_minor || 0) / 100;


          return `
            <article
              class="data-card
              provider-card
              clean-hotel-card
              ${
                isChosen
                  ? "is-selected-card"
                  : ""
              }"
            >

              <div class="card-header-row">

                <div>

                  <h4>
                    🏨 ${esc(h.name)}
                  </h4>

                  <span class="sub-code">
                    📍 ${esc(
                      h.area ||
                      latestTrip?.selected_destination ||
                      "Prime Location"
                    )}
                  </span>

                </div>

                <span class="rating-badge">
                  ${esc(
                    h.rating ||
                    "Rating unavailable"
                  )}
                </span>

              </div>


              <div class="card-section">

                <span class="card-label">
                  Reported property details:
                </span>

                <p class="card-text">
                  ${esc(
                    h.amenities ||
                    "No property details were returned by the research sources."
                  )}
                </p>

              </div>


              <div class="card-action-row provider-action-row">

                <div class="price-block">

                  <span class="price-val">
                    ${esc(displayPrice)}
                  </span>

                  <small>
                    ${totalAmount > 0
                      ? `₹${nightlyAmount.toLocaleString("en-IN")} per night · ${esc(quote.nights || 0)} night(s) · ${esc(quote.rooms || 0)} room(s) · sandbox quote`
                      : esc(h.price_note || "Outside sandbox payment limit")}
                  </small>

                </div>


                <div class="hotel-btns-group">

                  ${
                    isPaid
                      ? `
                        <button
                          class="primary added-btn"
                          type="button"
                          disabled
                        >
                          ✓ Sandbox reservation recorded
                        </button>
                      `
                    : `<button class="primary" type="button" onclick="completeSandboxPurchase('hotel', latestTrip.hotels[${i}])">${isPaid ? "Booked" : "Select & let payment agent book"}</button>`
                  }

                </div>

              </div>

            </article>
          `;
        })
        .join("")}

    </div>
  `;
}


// =============================================================
// CAB CARDS
// =============================================================

function renderCabCards(cabs) {
  if (!cabs || !cabs.length) {
    return `<div class="empty-notice">No live transport quotes are available from a connected provider.</div>`;
  }

  return `
    <div class="cards">

      ${(cabs || [])
        .map((c, i) => {

          const isChosen =
            selectedCab &&
            selectedCab.name === c.name;
          const isPaid = (latestTrip?.sandbox_bookings || []).some(booking =>
            booking.success && booking.payment?.items?.some(item => item.category === "cab" && item.name === c.name)
          );

          return `
            <article
              class="data-card provider-card ${
                isChosen
                  ? "is-selected-card"
                  : ""
              }"
            >

              <div class="card-header-row">

                <div>

                  <h4>
                    🚗 ${esc(c.name)}
                  </h4>

                  <span class="sub-code">
                    ${esc(c.route)}
                  </span>

                </div>

                <span class="status-badge ESTIMATED">
                  ESTIMATED
                </span>

              </div>


              <div class="card-section">

                <span class="card-label">
                  Vehicle & Service:
                </span>

                <p class="card-text">
                  ${esc(
                    c.vehicle ||
                    "Dedicated AC vehicle"
                  )}
                  ·
                  ${esc(
                    c.duration ||
                    "On schedule"
                  )}
                </p>

              </div>


              <div class="card-action-row provider-action-row">

                <div class="price-block">

                  <span class="price-val">
                    ${esc(
                      c.price ||
                      `₹${c.price_num}`
                    )}
                  </span>

                  <small>
                    sandbox quote · payment runs after selection
                  </small>

                </div>


                <button
                  class="primary ${isPaid ? "added-btn" : ""}"
                  type="button"
                  ${isPaid ? "disabled" : ""}
                  onclick="toggleCabSelection(${i})"
                >
                  ${
                    isPaid
                      ? "✓ Sandbox booking confirmed"
                      : "Select & let payment agent book"
                  }
                </button>

              </div>

            </article>
          `;
        })
        .join("")}

    </div>
  `;
}


// =============================================================
// BUDGET
// =============================================================

function renderBudgetBreakdown(trip) {

  const flightCost =
    selectedFlight
      ? (
          selectedFlight.price_num ||
          parseCurrencyNum(
            selectedFlight.price
          )
        )
      : 0;


  const hotelCost =
    selectedHotel
      ? (
          selectedHotel.total_num ||
          parseCurrencyNum(
            selectedHotel.total_price
          )
        )
      : 0;


  const cabCost =
    selectedCab
      ? (
          selectedCab.price_num ||
          parseCurrencyNum(
            selectedCab.price
          )
        )
      : 0;


  let activitiesCost = 0;


  (trip.itinerary_items || [])
    .forEach(act => {

      if (
        !act.is_flight_entry &&
        !act.is_hotel_entry &&
        !act.is_cab_entry
      ) {

        if (act.cost) {
          activitiesCost +=
            Number(act.cost);
        }

      }

    });


  const confirmedTotal =
    flightCost +
    hotelCost +
    cabCost +
    activitiesCost;


  const userBudget =
    trip.request?.budget
      ? Number(trip.request.budget)
      : null;


  let budgetComparison = "";


  if (userBudget) {

    if (
      confirmedTotal <=
      userBudget
    ) {

      budgetComparison = `
        <span class="budget-status-tag ok">
          ✓ Within target budget
          (₹${(
            userBudget -
            confirmedTotal
          ).toLocaleString("en-IN")}
          buffer remaining)
        </span>
      `;

    } else {

      budgetComparison = `
        <span class="budget-status-tag warning">
          ⚠️ Exceeds target budget by
          ₹${(
            confirmedTotal -
            userBudget
          ).toLocaleString("en-IN")}
        </span>
      `;

    }

  }


  return section(
    "Live Budget Breakdown & Cost Summary",
    `

      <div class="budget-summary-box">

        <div class="budget-grid-rich">

          <div
            class="budget-item ${
              selectedFlight
                ? "is-confirmed"
                : "is-pending"
            }"
          >

            <div class="budget-item-title">

              <span>
                ✈️ Flights
              </span>

              <small>
                ${
                  selectedFlight
                    ? `Selected (${selectedFlight.airline})`
                    : "Not added yet"
                }
              </small>

            </div>

            <strong class="budget-item-amount">
              ${
                flightCost
                  ? `₹${flightCost.toLocaleString("en-IN")}`
                  : "₹0"
              }
            </strong>

          </div>


          <div
            class="budget-item ${
              selectedHotel
                ? "is-confirmed"
                : "is-pending"
            }"
          >

            <div class="budget-item-title">

              <span>
                🏨 Accommodation
              </span>

              <small>
                ${
                  selectedHotel
                    ? `Selected (${selectedHotel.name.slice(
                        0,
                        18
                      )}...)`
                    : "Not added yet"
                }
              </small>

            </div>

            <strong class="budget-item-amount">
              ${
                hotelCost
                  ? `₹${hotelCost.toLocaleString("en-IN")}`
                  : "₹0"
              }
            </strong>

          </div>


          <div
            class="budget-item ${
              selectedCab
                ? "is-confirmed"
                : "is-pending"
            }"
          >

            <div class="budget-item-title">

              <span>
                🚗 Local Cabs / Transfers
              </span>

              <small>
                ${
                  selectedCab
                    ? `Selected (${selectedCab.name})`
                    : "Optional"
                }
              </small>

            </div>

            <strong class="budget-item-amount">
              ${
                cabCost
                  ? `₹${cabCost.toLocaleString("en-IN")}`
                  : "₹0"
              }
            </strong>

          </div>


          <div class="budget-item is-confirmed">

            <div class="budget-item-title">

              <span>
                🎟️ Activities & Sightseeing
              </span>

              <small>
                Estimated from itinerary
              </small>

            </div>

            <strong class="budget-item-amount">
              ${
                activitiesCost
                  ? `₹${activitiesCost.toLocaleString("en-IN")}`
                  : "₹0"
              }
            </strong>

          </div>

        </div>


        <div class="budget-total-row">

          <div>

            <span class="total-label">
              Total Selected & Scheduled Cost
            </span>

            ${budgetComparison}

          </div>


          <div class="total-amount-display">
            ₹${confirmedTotal.toLocaleString("en-IN")}
          </div>

        </div>

      </div>

    `,
    "Real-Time Tally"
  );
}


// =============================================================
// TRAVEL INSIGHTS
// =============================================================

function renderTravelInsights(insights) {

  if (!insights) return "";


  const photoSpots =
    (insights.photo_spots || [])
      .map(
        p =>
          `<li>📸 <b>Photo Spot:</b> ${esc(p)}</li>`
      )
      .join("");


  const foodTips =
    (insights.culinary_tips || [])
      .map(
        f =>
          `<li>🍲 <b>Culinary Tip:</b> ${esc(f)}</li>`
      )
      .join("");


  const transitTips =
    (insights.transit_hacks || [])
      .map(
        t =>
          `<li>🚕 <b>Transit Advice:</b> ${esc(t)}</li>`
      )
      .join("");


  const packingTips =
    (insights.packing_and_safety || [])
      .map(
        k =>
          `<li>🧳 <b>Packing & Safety:</b> ${esc(k)}</li>`
      )
      .join("");


  const creatorHighlights =
    (insights.creator_insights || [])
      .map(
        c =>
          `<div class="creator-insight-pill">✨ ${esc(c)}</div>`
      )
      .join("");


  return section(
    "💡 Creator Travel Insights & Local Recommendations",
    `

      <div class="insights-summary-container">

        <div class="creator-highlights-block">

          <strong>
            ✨ Top Creator Takeaways & Verified Secrets
          </strong>

          <div class="creator-pills-list">
            ${creatorHighlights}
          </div>

        </div>


        <div class="insights-columns-grid">

          <div class="insights-col">

            <h4>
              📸 Viewpoints & Photography
            </h4>

            <ul class="insights-list">
              ${photoSpots}
            </ul>

          </div>


          <div class="insights-col">

            <h4>
              🍲 Local Culinary & Dining
            </h4>

            <ul class="insights-list">
              ${foodTips}
            </ul>

          </div>


          <div class="insights-col">

            <h4>
              🚕 Local Navigation & Transit
            </h4>

            <ul class="insights-list">
              ${transitTips}
            </ul>

          </div>


          <div class="insights-col">

            <h4>
              🧳 Packing, Clothing & Safety
            </h4>

            <ul class="insights-list">
              ${packingTips}
            </ul>

          </div>

        </div>

      </div>

    `,
    "Synthesized Wisdom"
  );
}


// =============================================================
// MAIN TRIP RENDER
// =============================================================

function renderTrip(trip) {

  latestTrip = trip;

  const req = trip.request;

  const plan =
    trip.selected_destination ||
    req.destination ||
    "Selected Destination";


  const tripSummaryHtml = `

    <div class="trip-summary-banner">

      <div class="summary-hero">

        <div class="summary-dest-title">

          <h2>
            🌴 ${esc(plan)}
          </h2>

          <span class="origin-tag">
            Starting from
            <b>${esc(req.origin)}</b>
          </span>

        </div>


        <div class="summary-chips">

          <span class="summary-chip">
            📅 ${esc(req.start_date)}
            to
            ${esc(req.end_date)}
          </span>

          <span class="summary-chip">
            👥 ${esc(req.travelers)}
            Traveller(s)
            (${esc(req.traveler_type || "Solo")})
          </span>

          <span class="summary-chip">
            ⏱️ ${esc(req.pace)} pace
          </span>

          <span class="summary-chip">
            🏨 ${esc(req.accommodation)}
          </span>

        </div>

      </div>

    </div>
  `;


  const dashboardHtml = `

    ${tripSummaryHtml}

    ${section(
      "Day-by-Day Verified Itinerary",
      renderItinerary(
        trip.itinerary_items
      ),
      "Interactive Schedule",
      "itinerarySection"
    )}

    ${section(
      "Flight Options (Select to add to Itinerary)",
      renderFlightCards(
        trip.flights
      ),
      "Live / Estimated"
    )}

    <div id="hotelRecommendationsSection">

      ${section(
        "Accommodation Options (You select; payment agent books)",
        renderHotelCards(
          trip.hotels
        ),
        "Sandbox rates · test inventory"
      )}

    </div>


    ${section(
      "Local Transport & Cabs (You select; payment agent books)",
      renderCabCards(
        trip.cabs
      ),
      "Transfers"
    )}


    ${renderBudgetBreakdown(trip)}

    ${renderTravelInsights(
      trip.travel_insights
    )}

  `;


  $("tripId").textContent =
    `Trip Ref: ${
      trip.trip_id ||
      "tripmate-verified-plan"
    }`;


  $("resultBox").innerHTML =
    dashboardHtml;


  $("resultSection")
    .classList
    .remove("hidden");

  $("assistantLauncher")
    .classList
    .remove("hidden");

  $("progressPanel")
    .classList
    .add("hidden");
}


// =============================================================
// PROGRESS
// =============================================================

function renderProgress(
  items,
  activeLabel = ""
) {

  $("progressPanel")
    .classList
    .remove("hidden");

  $("resultSection")
    .classList
    .add("hidden");


  $("progressList").innerHTML =
    (items || [])
      .map(
        x => `
          <div
            class="${
              x.label === activeLabel
                ? "progress-active"
                : ""
            }"
          >

            <span>
              ${
                x.label === activeLabel
                  ? '<span class="loader"></span>'
                  : "✓"
              }
            </span>

            ${esc(x.label)}

          </div>
        `
      )
      .join("");
}


// =============================================================
// TRIP GENERATION
// =============================================================

$("tripForm").onsubmit =
  async event => {

    event.preventDefault();

    const submitButton =
      $("planSubmitBtn");

    const cancelButton =
      $("planCancelBtn");


    tripController =
      new AbortController();


    submitButton.disabled =
      true;

    cancelButton
      .classList
      .remove("hidden");


    submitButton.innerHTML =
      '<span class="loader"></span> Researching with Multi-Agent Graph...';


    const destText =
      $("destination")
        .value
        .trim();


    const destList =
      destText.includes(",")
        ? destText
            .split(",")
            .map(s => s.trim())
        : [destText];


    const payload = {

      request_id:
        window.crypto?.randomUUID?.() || `trip-${Date.now()}-${Math.random().toString(16).slice(2)}`,

      planning_mode: "known",

      destination:
        destText,

      selected_destinations:
        destList,

      origin:
        $("origin")
          .value
          .trim(),

      start_date:
        $("startDate")
          .value,

      end_date:
        $("endDate")
          .value,

      travelers:
        Number(
          $("travelers")
            .value
        ),

      traveler_type:
        $("travelerType")
          .value,

      budget:
        $("budget").value
          ? Number(
              $("budget")
                .value
            )
          : null,

      currency:
        $("currency")
          .value,

      interests:
        Array.from(
          selectedInterests
        ),

      pace:
        $("pace")
          .value,

      accommodation:
        $("accommodation")
          .value,

      special_requirements:
        $("requirements")
          .value
          .trim() ||
        null
    };


    renderProgress(
      [
        {
          label:
            "1. Normalizing trip requirements..."
        },
        {
          label:
            "2. Researching seasonal climate & weather..."
        },
        {
          label:
            "3. Verifying attractions & events..."
        },
        {
          label:
            "4. Checking flights, stays & transfers..."
        },
        {
          label:
            "5. Gemini synthesizing day-by-day verified itinerary & insights..."
        }
      ],
      "1. Normalizing trip requirements..."
    );


    try {

      const response =
        await fetch(
          "/api/trips",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(
                payload
              ),

            signal:
              tripController.signal
          }
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          "Could not generate trip plan."
        );
      }


      const trip =
        buildTripViewModel(
          payload,
          data.trip
        );


      renderTrip(trip);
      if (trip.demo_booking) {
        updatePaymentAgentPanel({
          ...trip.demo_booking,
          status: trip.demo_booking.success
            ? "Sandbox reservation recorded"
            : "Sandbox booking not completed",
          progress: trip.demo_booking.progress || []
        });
      }


      $("resultSection")
        .scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

    } catch (error) {

      $("progressList")
        .innerHTML =
          error.name ===
          "AbortError"

            ? `
              <div class="error">
                Research paused.
                You can start it again when ready.
              </div>
            `

            : `
              <div class="error">
                ${esc(error.message)}
              </div>
            `;

    } finally {

      submitButton.disabled =
        false;

      submitButton.innerHTML =
        'Generate Multi-Agent Trip Plan <span>→</span>';

      cancelButton
        .classList
        .add("hidden");

      tripController =
        null;
    }
  };


$("planCancelBtn")
  ?.addEventListener(
    "click",
    () => {
      tripController?.abort();
    }
  );


// =============================================================
// REPLANNING AGENT
// =============================================================

function openChangeAssistant(msg = "") {

  $("changeAssistant")
    .classList
    .remove("hidden");

  if (msg) {
    $("changeText")
      .placeholder = msg;
  }
}


$("assistantLauncher").onclick =
  () => openChangeAssistant();


$("adjustPlanBtn")
  ?.addEventListener(
    "click",
    () => openChangeAssistant()
  );


document
  .querySelector(".assistant-close")
  .onclick =
  () =>
    $("changeAssistant")
      .classList
      .add("hidden");


async function handleReplanning(
  changeText
) {

  if (
    !latestTrip ||
    !changeText.trim()
  ) {
    return;
  }


  openChangeAssistant(
    `Replanning Agent: Applying "${changeText}"...`
  );


  const applyBtn =
    $("applyChange");


  applyBtn.disabled =
    true;


  try {

    const response =
      await fetch(
        "/api/trips/replan",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              trip_id:
                latestTrip.trip_id ||
                "current",

              change_text:
                changeText,

              itinerary:
                (
                  latestTrip
                    .itinerary_items ||
                  []
                )
                  .filter(
                    act =>
                      !act.is_flight_entry &&
                      !act.is_hotel_entry &&
                      !act.is_cab_entry
                  )
                  .map(act => ({
                    date: act.date,
                    start_time:
                      act.start_time,
                    end_time:
                      act.end_time ||
                      "Flexible",
                    title: act.title,
                    location:
                      act.location,
                    description:
                      act.description,
                    estimated_cost:
                      act.cost,
                    cost_status:
                      act.status ||
                      "ESTIMATED",
                    reason:
                      act.reason ||
                      act.description
                  })),

              trip_context: {

                destination:
                  latestTrip
                    .selected_destination,

                origin:
                  latestTrip
                    .request?.origin,

                pace:
                  latestTrip
                    .request?.pace,

                start_date:
                  latestTrip.request?.start_date,

                end_date:
                  latestTrip.request?.end_date,

                travelers:
                  latestTrip.request?.travelers || 1,

                budget:
                  latestTrip.request?.budget,

                accommodation:
                  latestTrip.request?.accommodation || "Mid-range hotel"
              }

            })
        }
      );


    const data =
      await response.json();


    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "Replanning failed."
      );
    }


    if (
      data.updated_hotels &&
      data.updated_hotels.length > 0
    ) {

      latestTrip.hotels =
        data.updated_hotels.map(
          h => ({
            ...h,
            total_num: Number.isSafeInteger(Number(h.price_num)) && Number(h.price_num) > 0
              ? Number(h.price_num)
              : 0
          })
        );


      showToast(
        `✓ Found ${
          data.updated_hotels.length
        } researched accommodation options matching "${changeText}"!`
      );
    }


    const updatedActivities =
      data.itinerary.map(
        act => ({

          date:
            act.date,

          start_time:
            act.start_time,

          end_time:
            act.end_time ||
            "Flexible",

          title:
            act.title,

          location:
            act.location,

          description:
            act.description,

          reason:
            act.reason ||
            "Updated by Replanning Agent",

          status:
            act.cost_status ||
            "VERIFIED",

          cost:
            act.estimated_cost
              ? Number(
                  act.estimated_cost
                )
              : null,

          cost_text:
            act.estimated_cost
              ? `₹${Number(
                  act.estimated_cost
                ).toLocaleString("en-IN")}`
              : "Included",

          is_custom:
            true,

          is_hotel_entry:
            Boolean(act.booking_id),

          booking_id:
            act.booking_id,

          document_id:
            act.document_id
        })
      );

    if (data.sandbox_booking) {
      latestTrip.demo_booking = data.sandbox_booking;
      updatePaymentAgentPanel({
        ...data.sandbox_booking,
        status: data.sandbox_booking.success
          ? "Sandbox reservation recorded"
          : "Sandbox booking not completed",
        progress: data.sandbox_booking.progress || []
      });
    }
    if (data.booking_note) showToast(data.booking_note);


    if (selectedFlight) {

      updatedActivities.unshift({

        date:
          latestTrip
            .request
            .start_date,

        start_time:
          selectedFlight
            .departure ||
          "08:30",

        end_time:
          selectedFlight
            .arrival ||
          "11:45",

        title:
          `✈️ Confirmed Flight: ${selectedFlight.airline} (${selectedFlight.flight_number || "Direct"})`,

        location:
          `${latestTrip.request.origin} → ${latestTrip.selected_destination}`,

        description:
          `Confirmed transit flight. Baggage: ${selectedFlight.cabin || "Standard allowance"}.`,

        reason:
          "Confirmed Travel Booking",

        status:
          "VERIFIED",

        cost:
          selectedFlight.price_num,

        cost_text:
          selectedFlight.price,

        is_flight_entry:
          true
      });
    }


    if (selectedHotel) {

      updatedActivities.splice(
        1,
        0,
        {

          date:
            latestTrip
              .request
              .start_date,

          start_time:
            "14:00",

          end_time:
            "15:00",

          title:
            `🏨 Confirmed Stay: Check-in at ${selectedHotel.name}`,

          location:
            selectedHotel.area ||
            latestTrip
              .selected_destination,

          description:
            `Confirmed accommodation. ${
              selectedHotel.amenities ||
              "Breakfast & WiFi included"
            }.`,

          reason:
            "Accommodation Check-in",

          status:
            "VERIFIED",

          cost:
            selectedHotel.total_num,

          cost_text:
            selectedHotel.total_price,

          is_hotel_entry:
            true
        }
      );
    }


    latestTrip.itinerary_items =
      updatedActivities;


    const itinerarySection = document.getElementById("itinerarySection");
    if (itinerarySection) {
      itinerarySection.outerHTML = section(
        "Day-by-Day Verified Itinerary",
        renderItinerary(latestTrip.itinerary_items),
        "Interactive Schedule",
        "itinerarySection"
      );
    }
    if (data.updated_hotels?.length) {
      const hotelsSection = document.getElementById("hotelRecommendationsSection");
      if (hotelsSection) hotelsSection.innerHTML = section(
        "Accommodation Options (You select; payment agent books)",
        renderHotelCards(latestTrip.hotels),
        "Sandbox rates · test inventory"
      );
    }


    showToast(
      `✓ ${
        data.change_summary ||
        "Itinerary adjusted successfully!"
      }`
    );


    $("changeText").value =
      "";

  } catch (err) {

    alert(
      "Replanning error: " +
      err.message
    );

  } finally {

    applyBtn.disabled =
      false;
  }
}


$("applyChange").onclick =
  () =>
    handleReplanning(
      $("changeText").value
    );


$("changeText")
  .addEventListener(
    "keypress",
    e => {

      if (
        e.key === "Enter"
      ) {
        handleReplanning(
          $("changeText").value
        );
      }

    }
  );


document
  .querySelectorAll(
    ".quick-changes button"
  )
  .forEach(btn => {

    btn.onclick =
      () =>
        handleReplanning(
          btn.dataset.replan ||
          btn.textContent
        );

  });


// =============================================================
// SIMULATED AUTONOMOUS BOOKING
// =============================================================

// PAYMENT MESSAGE
// =============================================================

function showPaymentMessage(
  message,
  type = "success"
) {

  let element =
    document.getElementById(
      "paymentStatusMessage"
    );


  if (!element) {

    element =
      document.createElement(
        "div"
      );


    element.id =
      "paymentStatusMessage";


    element.style.position =
      "fixed";

    element.style.bottom =
      "24px";

    element.style.right =
      "24px";

    element.style.zIndex =
      "99999";

    element.style.maxWidth =
      "420px";

    element.style.padding =
      "16px 20px";

    element.style.borderRadius =
      "12px";

    element.style.background =
      type === "success"
        ? "#166534"
        : "#991b1b";

    element.style.color =
      "white";

    element.style.fontWeight =
      "600";

    element.style.boxShadow =
      "0 10px 30px rgba(0,0,0,.35)";


    document.body.appendChild(
      element
    );

  }


  element.textContent =
    message;


  clearTimeout(
    element._hideTimer
  );


  element._hideTimer =
    setTimeout(
      () => {

        element.remove();

      },
      5000
    );

}

$("downloadDemoDocsBtn")?.addEventListener("click", () => {
  const documents = latestTrip?.demo_booking?.payment?.documents;
  if (!documents) return;
  const sections = Object.entries(documents)
    .filter(([key]) => key !== "label")
    .map(([name, document]) => {
      const rows = Object.entries(document)
        .filter(([key, value]) => key !== "label" && value !== null && typeof value !== "object")
        .map(([key, value]) => {
          const rendered = key === "amount_minor"
            ? `₹${(Number(value) / 100).toLocaleString("en-IN")}`
            : String(value);
          return `<tr><th>${esc(key.replaceAll("_", " "))}</th><td>${esc(rendered)}</td></tr>`;
        }).join("");
      return `<section><h2>${esc(name.replaceAll("_", " "))}</h2><table>${rows}</table></section>`;
    }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>TripMate sandbox booking documents</title><style>body{font:16px Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#172033}header{border-bottom:2px solid #334155;padding-bottom:16px}h1{font-size:24px}h2{text-transform:capitalize}section{margin:24px 0;break-inside:avoid}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #cbd5e1}th{text-transform:capitalize;width:36%}.label{color:#b91c1c;font-weight:bold}@media print{button{display:none}}</style></head><body><header><h1>TripMate booking documents</h1><p class="label">${esc(documents.label || "SANDBOX / SIMULATED BOOKING")}</p><p>These documents record sandbox activity only. They are not a supplier reservation or real payment receipt.</p></header>${sections}<button onclick="window.print()">Print / Save as PDF</button></body></html>`;
  if (typeof html2pdf === "undefined") {
    showToast("PDF generator is unavailable. Refresh the page and try again.");
    return;
  }
  const pdfContent = document.createElement("div");
  pdfContent.style.cssText = "font:14px Arial,sans-serif;max-width:760px;margin:24px auto;padding:24px;color:#172033;background:#fff";
  pdfContent.innerHTML = `<h1>TripMate booking documents</h1><p><strong>${esc(documents.label || "SANDBOX / SIMULATED BOOKING")}</strong></p><p>Sandbox record only; no supplier reservation or real payment.</p>${sections}`;
  document.body.appendChild(pdfContent);
  html2pdf().set({filename: `TripMate-booking-${latestTrip.demo_booking.booking_id || "sandbox"}.pdf`, margin: 0.4,
    html2canvas: {scale: 2, backgroundColor: "#ffffff"}, jsPDF: {unit: "in", format: "a4", orientation: "portrait"}})
    .from(pdfContent).save().then(() => pdfContent.remove()).catch(() => { pdfContent.remove(); showToast("Could not generate the booking PDF."); });
  return;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `TripMate-sandbox-${latestTrip.demo_booking.booking_id || "booking"}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});


// =============================================================
// DOWNLOAD PDF
// =============================================================

function downloadPlan() {

  if (!latestTrip) return;


  if (
    typeof html2pdf ===
    "undefined"
  ) {

    alert(
      "PDF generator is loading. Please try again in a moment."
    );

    return;
  }


  html2pdf()
    .set({

      margin:
        0.4,

      filename:
        `TripMate-${
          (
            latestTrip
              .selected_destination ||
            "trip"
          )
            .replace(
              /\s+/g,
              "_"
            )
        }.pdf`,

      html2canvas: {
        scale: 2,
        backgroundColor:
          "#07111f"
      },

      jsPDF: {
        unit: "in",
        format: "a4",
        orientation:
          "portrait"
      }

    })
    .from(
      $("resultBox")
    )
    .save();
}


// =============================================================
// DISCOVERY HANDOFF
// =============================================================

window.addEventListener(
  "DOMContentLoaded",
  () => {

    const todayStr =
      new Date()
        .toISOString()
        .split("T")[0];


    $("startDate").min =
      todayStr;

    $("endDate").min =
      todayStr;


    const urlParams =
      new URLSearchParams(
        window.location.search
      );


    const fromDiscovery =
      urlParams.get(
        "from_discovery"
      ) === "true";


    let storedStartDate = "";
    let storedEndDate = "";


    if (fromDiscovery) {

      try {

        storedStartDate =
          sessionStorage.getItem(
            "tripmate_discovery_start_date"
          ) || "";


        storedEndDate =
          sessionStorage.getItem(
            "tripmate_discovery_end_date"
          ) || "";

      } catch (e) {}

    }


    const destParam =
      urlParams.get(
        "destination"
      );


    const originParam =
      urlParams.get(
        "origin"
      );


    const monthParam =
      urlParams.get(
        "month"
      );


    const yearParam =
      urlParams.get(
        "year"
      ) ||
      "2026";


    const startDateParam =
      urlParams.get(
        "start_date"
      ) ||
      urlParams.get(
        "startDate"
      ) ||
      storedStartDate;


    const endDateParam =
      urlParams.get(
        "end_date"
      ) ||
      urlParams.get(
        "endDate"
      ) ||
      storedEndDate;


    const daysParam =
      Number(
        urlParams.get(
          "days"
        )
      ) ||
      5;


    const paceParam =
      urlParams.get(
        "pace"
      );


    const budgetParam =
      urlParams.get(
        "budget"
      );


    const autostart =
      urlParams.get(
        "autostart"
      ) === "true";


    if (destParam) {

      $("destination")
        .value =
        destParam;


      if (originParam) {
        $("origin")
          .value =
          originParam;
      }


      if (paceParam) {
        $("pace")
          .value =
          paceParam;
      }


      if (budgetParam) {
        $("budget")
          .value =
          budgetParam;
      }


      if (
        startDateParam &&
        endDateParam
      ) {

        $("startDate")
          .value =
          startDateParam;

        $("endDate")
          .value =
          endDateParam;

      } else if (
        monthParam
      ) {

        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December"
        ];


        const mIdx =
          monthNames.indexOf(
            monthParam
          );


        if (mIdx !== -1) {

          const mm =
            String(
              mIdx + 1
            ).padStart(
              2,
              "0"
            );


          $("startDate")
            .value =
            `${yearParam}-${mm}-10`;


          const endDate =
            new Date(
              Number(yearParam),
              mIdx,
              10 + daysParam - 1
            );


          $("endDate")
            .value =
            endDate
              .toISOString()
              .split("T")[0];

        }

      } else {

        const tomorrow =
          new Date();


        tomorrow.setDate(
          tomorrow.getDate() + 1
        );


        const after4 =
          new Date(
            tomorrow
          );


        after4.setDate(
          after4.getDate() + 4
        );


        $("startDate")
          .value =
          tomorrow
            .toISOString()
            .split("T")[0];


        $("endDate")
          .value =
          after4
            .toISOString()
            .split("T")[0];

      }


      if (
        fromDiscovery
      ) {

        const banner =
          $("discoveryHandoffBanner");


        banner
          .classList
          .remove("hidden");


        $("handoffTitle")
          .textContent =
          `✨ Loaded: ${destParam} for ${
            monthParam || ""
          } ${yearParam}`;


        $("handoffDesc")
          .textContent =
          `Starting from ${
            originParam ||
            "your location"
          }. Verified multi-agent inputs pre-filled.`;


        $("clearHandoffBtn")
          .onclick =
          () => {

            banner
              .classList
              .add("hidden");


            window.history
              .replaceState(
                {},
                document.title,
                "/"
              );

          };

      }


      if (
        autostart
      ) {

        setTimeout(
          () => {

            $("tripForm")
              .requestSubmit();

          },
          350
        );

      }

    } else {

      const start =
        new Date();


      start.setDate(
        start.getDate() + 7
      );


      const end =
        new Date(
          start
        );


      end.setDate(
        end.getDate() + 4
      );


      if (
        !$("startDate")
          .value
      ) {

        $("startDate")
          .value =
          start
            .toISOString()
            .split("T")[0];

      }


      if (
        !$("endDate")
          .value
      ) {

        $("endDate")
          .value =
          end
            .toISOString()
            .split("T")[0];

      }

    }

  }
);
