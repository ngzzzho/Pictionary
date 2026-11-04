"""Creates an isolated StoreKit test host outside the distributable repository."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
out=root.parent/'v1-checks/purchases/native-qa';out.mkdir(parents=True,exist_ok=True)
(out/'Host.swift').write_text('''import SwiftUI
@main struct PurchaseQAApp: App {
 var body: some Scene { WindowGroup { Text("Local StoreKit tests") } }
}
''')
objects={}
def ident(s):return hashlib.sha256(s.encode()).hexdigest()[:24].upper()
def obj(name,body):objects[ident(name)]=body;return ident(name)
def ref(name,path,kind):return obj(name,f'isa = PBXFileReference; lastKnownFileType = {kind}; path = "{path}"; sourceTree = "<absolute>";')
def build(name,file):return obj(name,f'isa = PBXBuildFile; fileRef = {file};')
host=ref('host',out/'Host.swift','sourcecode.swift');store=ref('store',root/'ios/App/App/PurchaseStore.swift','sourcecode.swift');test=ref('test',root/'tests/ios/PurchaseStoreTests.swift','sourcecode.swift');config=ref('config',root/'ios/App/FullGame.storekit','text')
app= obj('appproduct','isa = PBXFileReference; explicitFileType = wrapper.application; path = PurchaseQA.app; sourceTree = BUILT_PRODUCTS_DIR;')
testprod=obj('testproduct','isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = PurchaseTests.xctest; sourceTree = BUILT_PRODUCTS_DIR;')
main=obj('group',f'isa = PBXGroup; children = ({host},{store},{test},{config},{app},{testprod}); sourceTree = "<group>";')
def phase(name,typ,files):return obj(name,f'isa = {typ}; buildActionMask = 2147483647; files = ({",".join(files)}); runOnlyForDeploymentPostprocessing = 0;')
aps=phase('appsource','PBXSourcesBuildPhase',[build('hostbuild',host),build('storebuild',store)])
trs=phase('testsource','PBXSourcesBuildPhase',[build('testbuild',test)])
apr=phase('appresources','PBXResourcesBuildPhase',[build('configbuild',config)])
trr=phase('testresources','PBXResourcesBuildPhase',[build('configtestbuild',config)])
apf=phase('appframework','PBXFrameworksBuildPhase',[]);trf=phase('testframework','PBXFrameworksBuildPhase',[])
def configs(name,extra):
 ids=[]
 for mode in ['Debug','Release']:
  ids.append(obj(name+mode,'''isa = XCBuildConfiguration; name = %s; buildSettings = { SDKROOT = iphoneos; IPHONEOS_DEPLOYMENT_TARGET = 17.0; SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES; ENABLE_TESTABILITY = YES; SWIFT_OPTIMIZATION_LEVEL = "-Onone"; GENERATE_INFOPLIST_FILE = YES; CODE_SIGNING_ALLOWED = NO; TARGETED_DEVICE_FAMILY = "1,2"; %s };'''%(mode,extra)))
 return obj(name+'configs',f'isa = XCConfigurationList; buildConfigurations = ({",".join(ids)}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Debug;')
apc=configs('app','PRODUCT_NAME = PurchaseQA; PRODUCT_BUNDLE_IDENTIFIER = com.local.familydraw.purchaseqa; INFOPLIST_KEY_UILaunchScreen_Generation = YES;')
trc=configs('tests','PRODUCT_NAME = PurchaseTests; PRODUCT_BUNDLE_IDENTIFIER = com.local.familydraw.purchasetests; TEST_HOST = "$(BUILT_PRODUCTS_DIR)/PurchaseQA.app/PurchaseQA"; BUNDLE_LOADER = "$(TEST_HOST)"; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks";')
prc=configs('project','')
proxy=obj('proxy',f'isa = PBXContainerItemProxy; containerPortal = {ident("project")}; proxyType = 1; remoteGlobalIDString = {ident("app")}; remoteInfo = PurchaseQA;')
dep=obj('dependency',f'isa = PBXTargetDependency; target = {ident("app")}; targetProxy = {proxy};')
apt=obj('app',f'isa = PBXNativeTarget; buildConfigurationList = {apc}; buildPhases = ({aps},{apr},{apf}); buildRules = (); dependencies = (); name = PurchaseQA; productName = PurchaseQA; productReference = {app}; productType = "com.apple.product-type.application";')
trt=obj('tests',f'isa = PBXNativeTarget; buildConfigurationList = {trc}; buildPhases = ({trs},{trr},{trf}); buildRules = (); dependencies = ({dep}); name = PurchaseTests; productName = PurchaseTests; productReference = {testprod}; productType = "com.apple.product-type.bundle.unit-test";')
project=obj('project',f'isa = PBXProject; buildConfigurationList = {prc}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base); mainGroup = {main}; projectDirPath = ""; projectRoot = ""; targets = ({apt},{trt});')
proj=out/'PurchaseQA.xcodeproj';proj.mkdir(exist_ok=True)
(proj/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+ '\n'.join(f'{i} = {{{body}}};' for i,body in objects.items()) +f'\n}}; rootObject = {project}; }}\n')
schemes=proj/'xcshareddata/xcschemes';schemes.mkdir(parents=True,exist_ok=True)
def target(i,name):return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{i}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:PurchaseQA.xcodeproj"/>'
(schemes/'PurchaseQA.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2600" version="1.3"><BuildAction><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">{target(apt,'PurchaseQA.app')}</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{target(trt,'PurchaseTests.xctest')}</TestableReference></Testables></TestAction><LaunchAction buildConfiguration="Debug"><BuildableProductRunnable>{target(apt,'PurchaseQA.app')}</BuildableProductRunnable></LaunchAction></Scheme>''')
print(proj)
