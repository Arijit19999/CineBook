allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Force every Android module (incl. plugins like :jni) onto the installed, valid
// NDK. Flutter's default (28.2.13676358) downloaded corrupted in this environment.
// :app is pinned directly in app/build.gradle.kts (it is force-evaluated early,
// so afterEvaluate isn't allowed there); everything else is overridden after its
// own build script sets ndkVersion = flutter.ndkVersion.
subprojects {
    if (name != "app") {
        afterEvaluate {
            extensions.findByType(com.android.build.gradle.BaseExtension::class.java)?.ndkVersion = "27.1.12297006"
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
