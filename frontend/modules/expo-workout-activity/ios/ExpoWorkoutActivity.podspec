Pod::Spec.new do |s|
  s.name           = 'ExpoWorkoutActivity'
  s.version        = '1.0.0'
  s.summary        = 'ActivityKit Live Activity bridge for Dromos workouts'
  s.description    = 'Starts, updates, and ends the Dromos workout Live Activity.'
  s.author         = 'Dromos'
  s.homepage       = 'https://dromos.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.license        = { :type => 'MIT' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
