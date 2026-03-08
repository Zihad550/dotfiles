# This is a default config file for bottom.

[flags]
basic = true
battery = true
process_memory_as_value = true
enable_cache_memory = true

[styles.cpu]
all_entry_color = "{{ color7 }}"
avg_entry_color = "{{ accent }}"
cpu_core_colors = ["{{ color1 }}","{{ color3 }}","{{ color2 }}","{{ color4 }}","{{ color5 }}","{{ color6 }}"]
[styles.memory]
ram_color = "{{ color4 }}"
cache_color = "{{ color1 }}"
swap_color = "{{ color3 }}"
gpu_colors = ["{{ color5 }}","{{ color6 }}","{{ color1 }}","{{ color3 }}","{{ color2 }}","{{ color4 }}"]
arc_color = "{{ color6 }}"
[styles.network]
rx_color = "{{ color4 }}"
tx_color = "{{ color1 }}"
rx_total_color = "{{ color6 }}"
tx_total_color = "{{ color4 }}"
[styles.battery]
high_battery_color = "{{ color4 }}"
medium_battery_color = "{{ color3 }}"
low_battery_color = "{{ color1 }}"
[styles.tables]
headers = {color = "{{ color7 }}"}
[styles.graphs]
graph_color = "{{ color8 }}"
legend_text = {color = "{{ color8 }}"}
[styles.widgets]
border_color = "{{ color8 }}"
selected_border_color = "{{ accent }}"
widget_title = {color = "{{ color7 }}"}
text = {color = "{{ color7 }}"}
selected_text = {color = "{{ background }}", bg_color = "{{ accent }}"}
disabled_text = {color = "{{ color8 }}"}
