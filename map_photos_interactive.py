#!/usr/bin/env python3
"""
Interactive tool to manually map photos to components
Usage: python map_photos_interactive.py
"""

import json
import os
from pathlib import Path

SEMANTIC_DATA_FILE = 'semantic_data.json'
PHOTOS_DIR = 'public/images/damage'
OUTPUT_FILE = 'semantic_data_with_photos.json'

def load_semantic_data():
    """Load existing semantic data"""
    with open(SEMANTIC_DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def find_all_photos():
    """Find all photos in directory"""
    photos = []
    photo_extensions = {'.png', '.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG'}
    
    for root, dirs, files in os.walk(PHOTOS_DIR):
        for file in files:
            if Path(file).suffix in photo_extensions:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, '.')
                photos.append(rel_path)
    
    return sorted(photos)

def get_component_list(semantic_data):
    """Get list of all CorrectedIDs"""
    components = {}
    for global_id, data in semantic_data.items():
        corrected_id = data.get('CorrectedID')
        if corrected_id:
            components[corrected_id] = {
                'GlobalId': global_id,
                'Level': data.get('Level', 'N/A'),
                'Side': data.get('Side', 'N/A')
            }
    return components

def print_components(components):
    """Print list of available components"""
    print("\n" + "="*60)
    print("Available Components:")
    print("="*60)
    # Sort: numeric IDs first (by number), then non-numeric IDs (alphabetically)
    def sort_key(x):
        if x.isdigit():
            return (0, int(x))  # Numeric IDs: sort by number
        else:
            return (1, x)        # Non-numeric IDs: sort alphabetically
    
    for cid in sorted(components.keys(), key=sort_key):
        comp = components[cid]
        print(f"  {cid:>6} | Level: {comp['Level']:>5} | Side: {comp['Side']:>5}")
    print("="*60)

def map_photos_to_components(photos, components, semantic_data):
    """Interactive mapping of photos to components"""
    photo_mappings = {}
    
    print(f"\n📸 Found {len(photos)} photos to map\n")
    
    for i, photo in enumerate(photos, 1):
        print(f"\n[{i}/{len(photos)}] Photo: {os.path.basename(photo)}")
        print(f"Full path: {photo}")
        print("\nEnter CorrectedID(s) for this photo:")
        print("  - Single component: 505")
        print("  - Multiple components: 505,715,1027")
        print("  - Skip photo: press Enter")
        print("  - Show component list: type 'list'")
        print("  - Quit: type 'quit'")
        
        while True:
            user_input = input("\nIDs: ").strip()
            
            if user_input.lower() == 'quit':
                print("\n❌ Quitting...")
                return None
            
            if user_input.lower() == 'list':
                print_components(components)
                continue
            
            if user_input == '':
                print("  ⏭️  Skipped")
                break
            
            # Parse component IDs
            ids = [id.strip() for id in user_input.split(',')]
            
            # Validate IDs
            invalid_ids = [id for id in ids if id not in components]
            if invalid_ids:
                print(f"  ⚠️  Invalid IDs: {', '.join(invalid_ids)}")
                print("  Try again or type 'list' to see all components")
                continue
            
            # Store mapping
            photo_mappings[photo] = ids
            print(f"  ✅ Mapped to: {', '.join(ids)}")
            break
    
    return photo_mappings

def apply_mappings(semantic_data, photo_mappings, components):
    """Apply photo mappings to semantic data"""
    
    # Initialize Photos arrays
    for data in semantic_data.values():
        if 'Photos' not in data:
            data['Photos'] = []
    
    # Add photos based on mappings
    for photo, corrected_ids in photo_mappings.items():
        for corrected_id in corrected_ids:
            # Find the component with this CorrectedID
            global_id = components[corrected_id]['GlobalId']
            
            # Add photo if not already present
            if photo not in semantic_data[global_id]['Photos']:
                semantic_data[global_id]['Photos'].append(photo)
    
    return semantic_data

def main():
    print("="*60)
    print("Interactive Photo Mapping Tool")
    print("="*60)
    
    # Load data
    print("\n📂 Loading semantic data...")
    semantic_data = load_semantic_data()
    print(f"   Loaded {len(semantic_data)} components")
    
    print("\n🔍 Searching for photos...")
    photos = find_all_photos()
    print(f"   Found {len(photos)} photos")
    
    if not photos:
        print("\n❌ No photos found!")
        return
    
    # Get component list
    components = get_component_list(semantic_data)
    print(f"   {len(components)} components have CorrectedID")
    
    # Show components initially
    print_components(components)
    
    # Interactive mapping
    photo_mappings = map_photos_to_components(photos, components, semantic_data)
    
    if photo_mappings is None:
        return
    
    if not photo_mappings:
        print("\n⚠️  No photos were mapped")
        return
    
    # Apply mappings
    print("\n💾 Applying mappings...")
    semantic_data = apply_mappings(semantic_data, photo_mappings, components)
    
    # Save
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(semantic_data, f, indent=2, ensure_ascii=False)
    
    # Summary
    print("\n" + "="*60)
    print("✅ Success!")
    print("="*60)
    print(f"Mapped {len(photo_mappings)} photos")
    print(f"Output saved to: {OUTPUT_FILE}")
    
    # Show mapping summary
    print("\nMapping Summary:")
    for photo, ids in photo_mappings.items():
        print(f"  {os.path.basename(photo):50} → {', '.join(ids)}")
    
    print("\n" + "="*60)
    print("Next steps:")
    print("1. Review: semantic_data_with_photos.json")
    print("2. If correct: mv semantic_data_with_photos.json semantic_data.json")
    print("="*60)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()