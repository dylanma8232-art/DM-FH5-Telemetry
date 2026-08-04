import re

def update_file(filepath, component_name, props_name, missing_props):
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Update the destructuring in the component file (e.g. SessionChartsPanel.jsx)
    if 'props;' in content:
        # Find the block `const { ... } = props;`
        match = re.search(r'const\s+\{\s*(.*?)\s*\}\s*=\s*props;', content, re.DOTALL)
        if match:
            existing_props = [p.strip() for p in match.group(1).split(',')]
            # Add missing ones
            for mp in missing_props:
                if mp not in existing_props:
                    existing_props.append(mp)
            new_destructure = 'const {\n    ' + ',\n    '.join(existing_props) + '\n  } = props;'
            content = content.replace(match.group(0), new_destructure)
            with open(filepath, 'w') as f:
                f.write(content)
            print(f"Updated {component_name} props destructuring.")

def update_parent(filepath, props_name, missing_props):
    with open(filepath, 'r') as f:
        content = f.read()

    # Find the `useMemo` for the props
    regex = r'const\s+' + props_name + r'\s*=\s*useMemo\(\(\)\s*=>\s*\(\{\s*(.*?)\s*\}\),\s*\[(.*?)\]\);'
    match = re.search(regex, content, re.DOTALL)
    if match:
        existing_obj = [p.strip() for p in match.group(1).split(',') if p.strip()]
        existing_deps = [p.strip() for p in match.group(2).split(',') if p.strip()]
        
        for mp in missing_props:
            # Need to map some variables if they are renamed in parent context.
            # e.g., if mp is "analysis", maybe it's just "analysis"
            # We'll just add it directly as mp
            has_prop = any(p == mp or p.startswith(mp + ':') for p in existing_obj)
            if not has_prop:
                existing_obj.append(mp)
            if mp not in existing_deps:
                existing_deps.append(mp)
                
        new_obj_str = ',\n    '.join(existing_obj)
        new_deps_str = ',\n    '.join(existing_deps)
        
        new_memo = f'const {props_name} = useMemo(() => ({{\n    {new_obj_str}\n  }}), [\n    {new_deps_str}\n  ]);'
        content = content.replace(match.group(0), new_memo)
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {props_name} in parent.")
    else:
        print(f"Could not find {props_name} in parent!")

session_missing = [
    'DRIVING_PROBLEMS', 'PROBLEM_CATEGORIES', 'activeTurnIdx', 'advancedData', 'aeroData', 
    'analysis', 'badgeGreenStyle', 'badgeRedStyle', 'brakeGScatterData', 'brakingEvidenceData', 
    'btnInactiveStyle', 'btnSmallStyle', 'chartGuideStyle', 'chartSubTab', 'diffData', 
    'drivingSubTab', 'formatLapTime', 'formattedChannels', 'gearingData', 'getParamValue', 
    'ggScatterPoints', 'handleChartMouseLeave', 'handleChartMouseMove', 'lapTrendData', 
    'maxSessionRpm', 'onNavigate', 'raceOverview', 'sectionTitleStyle', 'selectedIssueCategory', 
    'selectedIssueId', 'selectedSession', 'selectedTurnReview', 'sessionConsultation', 
    'sessionTune', 'setActiveTab', 'setActiveTurnIdx', 'setChartSubTab', 'setDrivingSubTab', 
    'setReviewSubTab', 'setSelectedIssueCategory', 'setSelectedIssueId', 'slipChartDomain', 
    'steeringSpeedData', 'suspensionHistogram', 'turnsData', 'visibleWheels', 
    'wheelVisibilityControls', 'worstCorners'
]

tune_missing = ['aiDiagnosing', 'aiDiagnosis', 'availableSessions', 'diagnosing', 'setUnlockToast']

update_file('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/session/SessionChartsPanel.jsx', 'SessionChartsPanel', 'sessionChartsProps', session_missing)
update_parent('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/SessionHistoryPage.jsx', 'sessionChartsProps', session_missing)

update_file('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/tune/TuneDiagnosticModal.jsx', 'TuneDiagnosticModal', 'diagnosticModalProps', tune_missing)
update_parent('/Users/dylan/Desktop/fh5/forza-telemetry/client/src/components/pages/TuneManagerPage.jsx', 'diagnosticModalProps', tune_missing)

